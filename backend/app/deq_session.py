"""Drives the conversation with the DEQ.

`deq_protocol` says what one message looks like. This module says which
messages to send, in what order, and what a reply has to satisfy before the
app believes it.

The order comes from the real app. `USB_CAPTURE_NOTES.md` records the
sequence the Sound & Tune app sends on connect, read from a session that
reached a working connected state, and the same order appears in traffic
captured from a physical unit. The app is the authority on it, so
`STARTUP_STEPS` copies that order rather than inventing one.

Roles are the other way around from the capture. There the app is the host
and the DEQ answers. This app takes the host's place, so it sends those
commands and reads the DEQ's replies.

Three rules every reply must satisfy, all three confirmed against captured
traffic between the app and a real DEQ-S1000A2:

- the reply's command id equals the request's
- the reply's transaction id equals the request's, byte for byte
- STATUS, the first four body bytes, is zero

A reply that breaks one of these is not a reply to our request. The app's
own error codes come from the same checks: it raises `[Code:601]` when a
reply's content does not fit the request it answers.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.deq_blob import UserConfiguration, decode_blob, encode_blob
from app.deq_protocol import Direction, Message, decode_frame, encode_frame
from app.deq_transport import Transport, TransportTimeout

# Command ids, named so a reader does not have to hold the table in mind.
# Every one of these is in `deq_commands.json`, generated from the APK.
COMMAND_SYNC = 0x00
COMMAND_KEEPALIVE = 0x02
COMMAND_FIRMWARE_VERSION = 0x03
COMMAND_DEVICE_IDENTITY = 0x04
COMMAND_WRITE_COEFFICIENTS = 0x05
COMMAND_READ_CONFIGURATION_TABLE = 0x06
COMMAND_WRITE_USER_CONFIGURATION = 0x08
COMMAND_READ_USER_CONFIGURATION = 0x09
COMMAND_READ_CONFIGURATION = 0x0A
COMMAND_MODE = 0x0B
COMMAND_VOLUME = 0x0D
COMMAND_SPEAKER_MUTE_STATES = 0x1F
COMMAND_MUTE_STATE = 0x20
COMMAND_SET_TIMEOUT_INTERVAL = 0x21

STATUS_OFFSET = 0
STATUS_BYTES = 4
STATUS_OK = 0

# How long to wait for one reply. The app's own keepalive runs about every
# nine seconds, so a reply that takes longer than this is a dead link.
DEFAULT_TIMEOUT_SECONDS = 5.0

# The order the app sends on connect. Each entry is a command id and the
# body to send with it; a body of `b""` means the command carries nothing
# but its transaction id.
STARTUP_STEPS: tuple[tuple[int, bytes], ...] = (
    (COMMAND_SYNC, b""),
    (COMMAND_SET_TIMEOUT_INTERVAL, (0).to_bytes(4, "little")),
    (0x17, b""),
    (0x15, b""),
    (0x16, b""),
    (COMMAND_FIRMWARE_VERSION, b""),
    (COMMAND_DEVICE_IDENTITY, b""),
    (COMMAND_READ_CONFIGURATION, b""),
    (COMMAND_MUTE_STATE, b""),
    (COMMAND_SPEAKER_MUTE_STATES, b""),
    (COMMAND_READ_USER_CONFIGURATION, b""),
)


class SessionError(Exception):
    """The conversation with the unit failed."""


class ReplyMismatchError(SessionError):
    """A reply did not answer the request that was sent."""


class SessionTimeoutError(SessionError):
    """The unit did not answer in time."""


class DeviceStatusError(SessionError):
    """The unit answered, and said no.

    `status` is the value it reported. Non-zero means it refused the
    request; the app surfaces the same condition as a communication error.
    """

    def __init__(self, command_id: int, status: int) -> None:
        super().__init__(f"command 0x{command_id:02x} returned status {status}")
        self.command_id = command_id
        self.status = status


@dataclass(frozen=True)
class DeviceIdentity:
    """What the unit says it is, for the header to show."""

    firmware_version: int
    serial: str


class DeqSession:
    """Talks to one DEQ unit.

    It sends the unit's commands in the order the app sends them; you call
    `start()` and then the request methods; it depends on a `Transport` for
    the wire and on `deq_protocol` for the format.
    """

    def __init__(
        self,
        transport: Transport,
        timeout_seconds: float = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self.transport = transport
        self.timeout_seconds = timeout_seconds
        self._transaction_counter = 0

    def next_transaction_id(self) -> bytes:
        """Returns the next transaction id, 8 bytes little-endian.

        The unit mirrors this back unchanged, which is how a reply is
        matched to its request.
        """
        self._transaction_counter += 1
        return self._transaction_counter.to_bytes(8, "little")

    def exchange(self, command_id: int, body: bytes = b"") -> Message:
        """Sends one command and returns the reply it answers with."""
        request = Message(
            direction=Direction.TO_DEVICE,
            command_id=command_id,
            transaction_id=self.next_transaction_id(),
            body=body,
        )
        self.transport.send_frame(encode_frame(request))
        reply = self._read_reply(request)
        self._check_status(reply)
        return reply

    def _read_reply(self, request: Message) -> Message:
        try:
            frame = self.transport.receive_frame(self.timeout_seconds)
        except TransportTimeout as caught_error:
            raise SessionTimeoutError(
                f"no reply to command 0x{request.command_id:02x} "
                f"within {self.timeout_seconds} seconds"
            ) from caught_error
        reply = decode_frame(frame)
        self._check_matches(request, reply)
        return reply

    def _check_matches(self, request: Message, reply: Message) -> None:
        if reply.command_id != request.command_id:
            raise ReplyMismatchError(
                f"sent command 0x{request.command_id:02x}, "
                f"got a reply to 0x{reply.command_id:02x}"
            )
        if reply.transaction_id != request.transaction_id:
            raise ReplyMismatchError(
                f"command 0x{request.command_id:02x} got a reply carrying "
                f"transaction id {reply.transaction_id.hex()}, "
                f"not {request.transaction_id.hex()}"
            )

    def _check_status(self, reply: Message) -> None:
        """Raises when the unit reports a non-zero STATUS.

        A reply to the sync command carries no status, so there is nothing
        to check there.
        """
        if reply.command_id == COMMAND_SYNC or len(reply.body) < STATUS_BYTES:
            return
        status = int.from_bytes(reply.body[STATUS_OFFSET:STATUS_BYTES], "little")
        if status != STATUS_OK:
            raise DeviceStatusError(reply.command_id, status)

    def start(self) -> None:
        """Runs the app's own connect sequence, in order."""
        for command_id, body in STARTUP_STEPS:
            self.exchange(command_id, body)

    def send_keepalive(self) -> None:
        """Sends one keepalive. The app repeats this for the whole session."""
        self.exchange(COMMAND_KEEPALIVE)

    def read_device_identity(self) -> DeviceIdentity:
        """Returns the unit's firmware version and serial number."""
        version_reply = self.exchange(COMMAND_FIRMWARE_VERSION)
        identity_reply = self.exchange(COMMAND_DEVICE_IDENTITY)
        return DeviceIdentity(
            firmware_version=read_field(version_reply, offset=4, width=2),
            serial=read_text_field(identity_reply, offset=4, width=12),
        )

    def read_user_configuration(self) -> UserConfiguration:
        """Reads the unit's settings blob."""
        reply = self.exchange(COMMAND_READ_USER_CONFIGURATION)
        return decode_blob(reply.body[STATUS_BYTES:])

    def write_user_configuration(self, configuration: UserConfiguration) -> None:
        """Writes the settings blob back to the unit."""
        self.exchange(COMMAND_WRITE_USER_CONFIGURATION, encode_blob(configuration))

    def write_coefficients(self, config_id: int, configuration: bytes) -> None:
        """Sends one block of DSP coefficients.

        `deq_dsp` builds `configuration`. The unit answers a write with a
        short acknowledgement; it never echoes the block back.
        """
        self.exchange(
            COMMAND_WRITE_COEFFICIENTS,
            config_id.to_bytes(4, "little") + configuration,
        )

    def set_volume(self, volume_db: int) -> None:
        """Sets the master volume, in dB. The unit takes a signed value."""
        self.exchange(COMMAND_VOLUME, volume_db.to_bytes(4, "little", signed=True))

    def close(self) -> None:
        self.transport.close()


def read_field(reply: Message, offset: int, width: int) -> int:
    """Reads one little-endian number out of a reply body.

    `offset` counts from the start of the body, so it is the field's
    payload offset minus 16. `deq_commands.json` gives the payload offset.
    """
    return int.from_bytes(reply.body[offset:offset + width], "little")


def read_text_field(reply: Message, offset: int, width: int) -> str:
    """Reads one fixed-width string out of a reply body.

    The unit pads a short string with zero bytes, and its serial numbers
    are plain ASCII.
    """
    raw = reply.body[offset:offset + width]
    return raw.split(b"\x00", 1)[0].decode("ascii", errors="replace")

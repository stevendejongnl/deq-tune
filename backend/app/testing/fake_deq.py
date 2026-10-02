"""A DEQ unit that answers the way the real one does.

This is a `Transport`, so `DeqSession` talks to it exactly as it talks to a
real unit. No mocking library: a test passes one of these through the
session's constructor and reads `exchanges` afterwards.

Every rule below was measured from `captures/20260929_session_full.log`,
real traffic between the Pioneer app and a physical DEQ-S1000A2 — 217
matched request and reply pairs:

- the reply's command id equals the request's
- the reply's transaction id equals the request's, byte for byte
- the reply's length field is the request's plus 4
- STATUS, the first four body bytes, is zero
- the reply then echoes the request's own key field, where it has one

The last rule has one exception that matters. **The unit never echoes a
payload array back on a write.** A 2100-byte coefficient write gets a
24-byte acknowledgement, not a 2104-byte echo. Echoing a payload back is
what made the real app refuse a reply with `[Code:601]`, so this fake
refuses to do it too.

The fake raises on a command it does not know, rather than answering with
zeros. A silent zero-filled reply is what hid a real bug for days during
the protocol work: the app kept talking and only failed much later.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from app.deq_blob import UserConfiguration, decode_blob, encode_blob
from app.deq_protocol import Direction, Message, decode_frame, encode_frame
from app.deq_session import (
    COMMAND_DEVICE_IDENTITY,
    COMMAND_FIRMWARE_VERSION,
    COMMAND_READ_USER_CONFIGURATION,
    COMMAND_SYNC,
    COMMAND_WRITE_COEFFICIENTS,
    COMMAND_WRITE_USER_CONFIGURATION,
    STATUS_BYTES,
)
from app.deq_transport import TransportTimeout

STATUS_OK_BYTES = (0).to_bytes(STATUS_BYTES, "little")

# Above this request payload size the unit acknowledges rather than echoes.
# A 20-byte request still gets its field back; a 36-byte coefficient write
# does not.
ECHO_LIMIT_PAYLOAD_BYTES = 28

# What this fake unit reports about itself.
FAKE_FIRMWARE_VERSION = 0x0202
FAKE_SERIAL = "ABIV002781EW"
FAKE_SPEAKER_MODE = 3


@dataclass
class Exchange:
    """One request and the reply this fake gave it."""

    request: Message
    reply: Message


@dataclass
class FakeDeq:
    """A DEQ that answers by the rules captured from a real one.

    It replies to the commands a session sends; you hand it to
    `DeqSession` as its transport; it depends on `deq_protocol` to read and
    write frames and on `deq_blob` for the settings blob it serves.
    """

    configuration: UserConfiguration = field(default_factory=UserConfiguration)
    firmware_version: int = FAKE_FIRMWARE_VERSION
    serial: str = FAKE_SERIAL
    # Set this to stop answering, so a test can see a timeout.
    answers: bool = True

    exchanges: list[Exchange] = field(default_factory=list)
    sent_frames: list[bytes] = field(default_factory=list)
    _pending_reply: bytes | None = None
    closed: bool = False

    @property
    def command_order(self) -> list[int]:
        """The command ids this fake was sent, in order."""
        return [one.request.command_id for one in self.exchanges]

    def send_frame(self, frame: bytes) -> None:
        self.sent_frames.append(frame)
        request = decode_frame(frame)
        reply = self.build_reply(request)
        self.exchanges.append(Exchange(request=request, reply=reply))
        self._pending_reply = encode_frame(reply)

    def receive_frame(self, timeout_seconds: float) -> bytes:
        if not self.answers or self._pending_reply is None:
            raise TransportTimeout(f"fake DEQ sent nothing within {timeout_seconds} seconds")
        frame = self._pending_reply
        self._pending_reply = None
        return frame

    def close(self) -> None:
        self.closed = True

    def build_reply(self, request: Message) -> Message:
        """Returns the reply the real unit gives to one request."""
        return Message(
            direction=Direction.FROM_DEVICE,
            command_id=request.command_id,
            transaction_id=request.transaction_id,
            body=self.build_body(request),
        )

    def build_body(self, request: Message) -> bytes:
        """Returns one reply body: STATUS, then whatever the command adds."""
        if request.command_id == COMMAND_SYNC:
            return b""
        return STATUS_OK_BYTES + self.build_tail(request)

    def build_tail(self, request: Message) -> bytes:
        """Returns the part of a reply body after STATUS.

        A command with its own reply shape gets a named builder. Everything
        else follows the echo rule measured from the capture.
        """
        if request.command_id == COMMAND_FIRMWARE_VERSION:
            return self.firmware_version.to_bytes(2, "little")
        if request.command_id == COMMAND_DEVICE_IDENTITY:
            return self.build_identity_tail()
        if request.command_id == COMMAND_READ_USER_CONFIGURATION:
            return encode_blob(self.configuration)
        if request.command_id == COMMAND_WRITE_USER_CONFIGURATION:
            return self.accept_configuration(request)
        if request.command_id == COMMAND_WRITE_COEFFICIENTS:
            return self.acknowledge_coefficients(request)
        return self.echo_request_field(request)

    def build_identity_tail(self) -> bytes:
        """DEVICE_ID, RESERVED and SPEAKER_MODE, per the APK's field table."""
        serial_bytes = self.serial.encode("ascii")
        if len(serial_bytes) > 12:
            raise ValueError(f"serial {self.serial!r} does not fit in 12 bytes")
        return (
            serial_bytes.ljust(12, b"\x00")
            + bytes(4)
            + FAKE_SPEAKER_MODE.to_bytes(4, "little")
        )

    def accept_configuration(self, request: Message) -> bytes:
        """Stores a written blob, so a later read returns it."""
        self.configuration = decode_blob(request.body)
        return b""

    def acknowledge_coefficients(self, request: Message) -> bytes:
        """Answers a coefficient write with its CONFIG_ID and nothing else.

        This is the rule that matters most. The real unit sends 24 payload
        bytes back for a 2100-byte write.
        """
        return request.body[:4]

    def echo_request_field(self, request: Message) -> bytes:
        """Echoes a small request's own field back, as the unit does.

        A request big enough to carry a payload array gets an
        acknowledgement instead; see this module's docstring.
        """
        if request.payload_length > ECHO_LIMIT_PAYLOAD_BYTES:
            raise UnknownCommandError(request.command_id, request.payload_length)
        return request.body


class UnknownCommandError(Exception):
    """This fake was sent a command it has no measured reply for.

    Answering with zeros instead would let a test pass against behaviour
    no real unit has ever shown.
    """

    def __init__(self, command_id: int, payload_length: int) -> None:
        super().__init__(
            f"fake DEQ has no reply rule for command 0x{command_id:02x} "
            f"with a {payload_length}-byte payload"
        )
        self.command_id = command_id
        self.payload_length = payload_length

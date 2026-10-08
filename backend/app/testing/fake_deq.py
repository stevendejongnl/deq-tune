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
    COMMAND_AUTO_SAVE_EQ_MODE,
    COMMAND_CRASH_REPORT,
    COMMAND_SYSTEM_ERROR_FLAGS,
    COMMAND_DEVICE_IDENTITY,
    COMMAND_FIRMWARE_VERSION,
    COMMAND_READ_USER_CONFIGURATION,
    COMMAND_SYNC,
    COMMAND_WRITE_COEFFICIENTS,
    COMMAND_WRITE_USER_CONFIGURATION,
    STATUS_BYTES,
    STATUS_OK,
)
from app.deq_transport import TransportTimeout

STATUS_OK_BYTES = (0).to_bytes(STATUS_BYTES, "little")

# Above this request payload size the unit acknowledges rather than echoes.
# A 20-byte request still gets its field back; a 36-byte coefficient write
# does not.
ECHO_LIMIT_PAYLOAD_BYTES = 28

# What this fake unit reports about itself. Measured from the real
# DEQ-S1000A2 in the car on 2026-10-08, not invented.
FAKE_FIRMWARE_VERSION = 0x0202
FAKE_SERIAL = "ABIV002781EW"
FAKE_SPEAKER_MODE = 3

# The 16-byte word the unit returns in its sync reply. Hardcoded in the app
# as `b/a/e$b.a`, and the real unit sent exactly this.
REPLY_SYNC_WORD = bytes.fromhex("3dd378e1054592964b2ede1fb9283b2b")

# The sync reply the real unit sends is 32 bytes: STATUS, the word above,
# and then the three ASP_STATE fields of `deq_commands.json`.
STATUS_REFUSED_SYNC = -5

# The volume the car's own unit reported, so the default is a real value.
FAKE_VOLUME_DB = -27


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

    # The live state the unit reports in its sync reply.
    volume_db: int = FAKE_VOLUME_DB
    muted: bool = False
    driving: bool = False

    # Faults, so a caller can drive the error paths on purpose.
    #
    # `refuses_sync` reproduces what the real unit does when COMMAND_SYNC
    # carries no body: STATUS -5 and then nothing. It is the bug that cost
    # two car sessions, so a fake that cannot reproduce it is not much of a
    # fake.
    refuses_sync: bool = False
    # STATUS to answer with, per command id. Anything not listed answers 0.
    status_by_command: dict[int, int] = field(default_factory=dict)
    # Command ids to stop answering after, so a caller can see a timeout
    # mid-sequence rather than only at the start.
    silent_after: set[int] = field(default_factory=set)
    # What 0x17 and 0x15 report. Empty means no fault, which is what the
    # real unit sent.
    error_flags: int = 0
    crash_report: bytes = b""

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
        if not self.answers:
            # Already quiet: the request is recorded, nothing is answered.
            return
        reply = self.build_reply(request)
        self.exchanges.append(Exchange(request=request, reply=reply))
        self._pending_reply = encode_frame(reply)
        if request.command_id in self.silent_after:
            self.answers = False

    def receive_frame(self, timeout_seconds: float) -> bytes:
        """Returns the reply this fake is holding, if it has one.

        A reply already built is still delivered when the unit has gone
        quiet. The real unit sends its refusal and *then* stops answering,
        so swallowing that last frame would hide the refusal itself.
        """
        if self._pending_reply is None:
            raise TransportTimeout(
                f"fake DEQ sent nothing within {timeout_seconds} seconds"
            )
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
            return self.build_sync_body(request)
        status = self.status_by_command.get(request.command_id, STATUS_OK)
        if status != STATUS_OK:
            # A failing reply carries STATUS and nothing else, which is what
            # the real unit sent when it refused.
            return self.status_bytes(status)
        return STATUS_OK_BYTES + self.build_tail(request)

    def build_sync_body(self, request: Message) -> bytes:
        """Returns the sync reply: STATUS, the word, and the live state.

        The real unit refuses a COMMAND_SYNC that carries no body. It
        answers STATUS -5 with no other field and then stops answering
        anything, so this reproduces both halves.
        """
        if self.refuses_sync or not request.body:
            self.answers = False
            return self.status_bytes(STATUS_REFUSED_SYNC)
        return (
            STATUS_OK_BYTES
            + REPLY_SYNC_WORD
            + self.volume_db.to_bytes(4, "little", signed=True)
            + int(self.muted).to_bytes(4, "little")
            + int(self.driving).to_bytes(4, "little")
        )

    @staticmethod
    def status_bytes(status: int) -> bytes:
        """Returns one STATUS field. Signed: failure is negative."""
        return status.to_bytes(STATUS_BYTES, "little", signed=True)

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
        if request.command_id == COMMAND_SYSTEM_ERROR_FLAGS:
            return self.error_flags.to_bytes(4, "little")
        if request.command_id == COMMAND_CRASH_REPORT:
            return self.crash_report
        if request.command_id == COMMAND_AUTO_SAVE_EQ_MODE:
            # Unlike the small commands the echo rule covers, this reply's
            # own fields (deq_commands.json) are TRANSACTION_ID and STATUS
            # only -- ENABLE_FLAG is not echoed back.
            return b""
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

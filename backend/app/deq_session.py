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
from app.deq_dsp import (
    CROSSOVER_SLOT_COUNT,
    TIME_ALIGNMENT_SLOT_COUNT,
    FilterSlope,
    build_crossover_payload,
    build_equalizer_payload,
    build_time_alignment_payload,
    crossover_slot_settings,
)
from app.deq_protocol import Direction, Message, decode_frame, encode_frame
from app.deq_transport import Transport, TransportTimeout
from app.eq_data import TuningData

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

# Which CONFIG_ID carries which block of command 0x05. Read from the APK:
# `b/e/ab`'s dispatch maps each id to the field enum that declares its
# CONFIGURATION size, and the sizes settle the mapping.
#
#   id 10 -> af$a$g, 0x20 = 32 bytes, two 16-byte time-alignment blocks
#   id 11 -> af$a$e, 0xb8 = 184 bytes, the standard crossover
#   id 12 -> af$a$f, 0x1a8 = 424 bytes, the network crossover
#   id 13 -> af$a$h, 0x82c = 2080 bytes, the equalizer
#
# The 2080 and the two crossover sizes match `conformance/flows.json` byte
# for byte, so the mapping is checked, not assumed.
CONFIG_ID_TIME_ALIGNMENT = 10
CONFIG_ID_CROSSOVER_STANDARD = 11
CONFIG_ID_CROSSOVER_NETWORK = 12
CONFIG_ID_EQUALIZER = 13

# A crossover layout and the CONFIG_ID that carries it.
CROSSOVER_CONFIG_IDS = {
    "standard": CONFIG_ID_CROSSOVER_STANDARD,
    "standard_rear": CONFIG_ID_CROSSOVER_STANDARD,
    "network": CONFIG_ID_CROSSOVER_NETWORK,
}

# The order the unit's time-alignment slots sit in, from `w$a` in the APK.
# A profile that drives no subwoofer still fills the fifth slot.
TIME_ALIGNMENT_CHANNELS = ("FL", "FR", "RL", "RR")

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

    def write_tuning(self, tuning: TuningData, layout: str = "standard") -> None:
        """Sends one profile's whole DSP state to the unit.

        Three blocks of command 0x05, each under its own CONFIG_ID: the
        equalizer, the time alignment, and the crossover. `deq_dsp` builds
        every one of them; this method only says which CONFIG_ID carries
        which and in what order.
        """
        self.write_equalizer(tuning)
        self.write_time_alignment(tuning)
        self.write_crossover(tuning, layout)

    def write_equalizer(self, tuning: TuningData) -> None:
        """Sends the 13 band gains, cancelled curve first."""
        plain_gains_db = selected_band_gains_db(tuning)
        cancelled_gains_db = cancelled_band_gains_db(tuning, plain_gains_db)
        self.write_coefficients(
            CONFIG_ID_EQUALIZER,
            build_equalizer_payload(cancelled_gains_db, plain_gains_db),
        )

    def write_time_alignment(self, tuning: TuningData) -> None:
        """Sends the per-speaker delays, as two blocks."""
        distances_mm = speaker_distances_mm(tuning)
        self.write_coefficients(
            CONFIG_ID_TIME_ALIGNMENT,
            build_time_alignment_payload(distances_mm),
        )

    def write_crossover(self, tuning: TuningData, layout: str) -> None:
        """Sends the high-pass filters for one speaker layout."""
        if layout not in CROSSOVER_CONFIG_IDS:
            raise ValueError(f"unknown crossover layout {layout!r}")
        cutoff_positions, slopes = crossover_slot_inputs(tuning)
        settings = crossover_slot_settings(layout, cutoff_positions, slopes)
        self.write_coefficients(
            CROSSOVER_CONFIG_IDS[layout],
            build_crossover_payload(layout, settings),
        )

    def set_volume(self, volume_db: int) -> None:
        """Sets the master volume, in dB. The unit takes a signed value."""
        self.exchange(COMMAND_VOLUME, volume_db.to_bytes(4, "little", signed=True))

    def close(self) -> None:
        self.transport.close()


def selected_band_gains_db(tuning: TuningData) -> list[float]:
    """Returns the 13 band gains the profile has active.

    `foundationEq.eqs` holds one slot per channel group, and each slot
    stores several banks with `selectedBank` naming the live one. A profile
    in LR mode keeps one combined slot; the unit still wants one curve.
    """
    slots = tuning.foundationEq.eqs
    if slots == {}:
        raise ValueError("the profile carries no equalizer slot")
    slot = slots.get("LR") or next(iter(slots.values()))
    if slot.selectedBank >= len(slot.banks):
        raise ValueError(
            f"the profile selects bank {slot.selectedBank}, "
            f"but carries only {len(slot.banks)}"
        )
    return list(slot.banks[slot.selectedBank])


def cancelled_band_gains_db(
    tuning: TuningData, plain_band_gains_db: list[float]
) -> list[float]:
    """Returns the curve with the factory cancelling equalizer added in.

    The unit wants two curves: one with the cancelling equalizer applied
    and one without. A profile that has no cancelling data, or has it
    switched off, sends the same curve twice.
    """
    cancel = tuning.factoryCancel
    if not cancel.available or not cancel.enabled:
        return list(plain_band_gains_db)
    left = cancel.data.cancellingEQ.L
    return [
        plain_gain_db + cancel_gain_db
        for plain_gain_db, cancel_gain_db in zip(plain_band_gains_db, left)
    ]


def speaker_distances_mm(tuning: TuningData) -> list[int]:
    """Returns one distance per time-alignment slot, in millimetres.

    The profile stores centimetres, and the library works in whole
    millimetres. A layout with no subwoofer still fills the fifth slot, and
    it takes the farthest distance so the unit delays it by nothing.
    """
    distances_mm = [
        round(tuning.speakers[channel].timeAlignmentCm * 10)
        for channel in TIME_ALIGNMENT_CHANNELS
        if channel in tuning.speakers
    ]
    if distances_mm == []:
        raise ValueError("the profile names no speaker this unit drives")
    while len(distances_mm) < TIME_ALIGNMENT_SLOT_COUNT:
        distances_mm.append(max(distances_mm))
    return distances_mm


def crossover_slot_inputs(tuning: TuningData) -> tuple[list[int], list[FilterSlope]]:
    """Returns one cutoff position and one slope per filter slot.

    The unit addresses five slots. The profile carries a front and a rear
    high-pass filter, which are slots 0 and 1; it has no value for the
    other three, so they stay at Pass and the unit leaves them alone.

    Both profile fields are positions, not physical units: `cutoff_hpf` is
    an index into the 11-entry cutoff table and `slope_hpf` is the filter
    order. A factory preset stores 9 and 2 for its rear filter, which is
    200 Hz at 12 dB per octave.
    """
    cutoff_positions = [0] * CROSSOVER_SLOT_COUNT
    slopes = [FilterSlope.PASS] * CROSSOVER_SLOT_COUNT
    for slot, band in enumerate((tuning.filter.front, tuning.filter.rear)):
        cutoff_positions[slot] = int(band.cutoff_hpf)
        slopes[slot] = FilterSlope(int(band.slope_hpf))
    return cutoff_positions, slopes


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

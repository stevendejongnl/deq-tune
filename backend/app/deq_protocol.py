"""Parser for the DEQ's USB SysEx-style protocol.

Decoded from a real USB capture between the Sound & Tune Android app and a
physical Pioneer DEQ-S1000A2 unit (see USB_CAPTURE_NOTES.md in the outer
repo for the capture session and the byte-level reasoning behind this
frame layout). The capture is partial: the parameter-id-to-control mapping
and the value encoding are not yet fully confirmed. Extend
KNOWN_PARAMETER_NAMES as more parameter ids get identified.

Frame layout, all offsets 0-indexed into the full frame including the
start and end markers:

    byte 0        : 0xf0 (SysEx start marker)
    bytes 1-7     : fixed prefix, identical on every frame seen so far
    byte 8        : always 0x00 seen so far
    byte 9        : 0x01 for a write (app -> DEQ), 0x02 for a read (DEQ -> app)
    bytes 10-13   : 0x00 0x00 0x00 <parameter id>
    bytes 14-15   : length/flavor field (differs between write and read)
    last byte     : 0xf7 (SysEx end marker)
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel

FRAME_START_MARKER = 0xF0
FRAME_END_MARKER = 0xF7
FIXED_PREFIX = bytes([0x00, 0x40, 0x06, 0x00, 0x00, 0x00, 0x01])

DIRECTION_BYTE_OFFSET = 9
PARAMETER_ID_BYTE_OFFSET = 13
PAYLOAD_START_OFFSET = 16

WRITE_DIRECTION_BYTE = 0x01
READ_DIRECTION_BYTE = 0x02


class FrameDirection(str, Enum):
    WRITE = "write"
    READ = "read"


class InvalidFrameError(ValueError):
    """Raised when a byte sequence is not a valid DEQ protocol frame."""


class DeqFrame(BaseModel):
    direction: FrameDirection
    parameterId: int
    payload: bytes

    model_config = {"arbitrary_types_allowed": True}


def parse_deq_frame(frame: bytes) -> DeqFrame:
    """Parse one captured SysEx-style frame from the DEQ's USB protocol.

    Raises InvalidFrameError if the frame does not match the known
    start/end markers, fixed prefix, or direction byte.
    """
    if len(frame) < PAYLOAD_START_OFFSET + 1:
        raise InvalidFrameError(f"frame too short: {len(frame)} bytes")
    if frame[0] != FRAME_START_MARKER:
        raise InvalidFrameError(f"missing start marker: got {frame[0]:#x}")
    if frame[-1] != FRAME_END_MARKER:
        raise InvalidFrameError(f"missing end marker: got {frame[-1]:#x}")

    prefix = frame[1:1 + len(FIXED_PREFIX)]
    if prefix != FIXED_PREFIX:
        raise InvalidFrameError(f"unexpected fixed prefix: {prefix.hex()}")

    directionByte = frame[DIRECTION_BYTE_OFFSET]
    if directionByte == WRITE_DIRECTION_BYTE:
        direction = FrameDirection.WRITE
    elif directionByte == READ_DIRECTION_BYTE:
        direction = FrameDirection.READ
    else:
        raise InvalidFrameError(f"unknown direction byte: {directionByte:#x}")

    parameterId = frame[PARAMETER_ID_BYTE_OFFSET]
    payload = frame[PAYLOAD_START_OFFSET:-1]

    return DeqFrame(direction=direction, parameterId=parameterId, payload=payload)


# Parameter ids seen in the 2026-09-28 car capture, not yet mapped to a
# named control. Fill in as a session correlates a tapped UI control with
# its captured parameter id (see USB_CAPTURE_NOTES.md, "Not yet decoded").
KNOWN_PARAMETER_NAMES: dict[int, str] = {}


def parameter_name(parameterId: int) -> str:
    """Human-readable name for a parameter id, or the raw id if unknown."""
    return KNOWN_PARAMETER_NAMES.get(parameterId, f"unknown_parameter_{parameterId:#04x}")

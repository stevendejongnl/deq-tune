import pytest

from app.deq_protocol import (
    FrameDirection,
    InvalidFrameError,
    parameter_name,
    parse_deq_frame,
)

# Real write/read pair captured 2026-09-28 while dragging one EQ slider.
# See USB_CAPTURE_NOTES.md for the full session notes.
CAPTURED_WRITE_FRAME = bytes.fromhex(
    "f0 00 40 06 00 00 00 01 00 01 00 00 00 0d 00 00"
    "00 0c 00 00 00 00 00 00 03 0c 00 00 00 00 00 00"
    "00 00 00 00 00 00 00 00 0f 02 0f 0f 0f 0f 0f 0f"
    "f7".replace(" ", "")
)
CAPTURED_READ_FRAME = bytes.fromhex(
    "f0 00 40 06 00 00 00 01 00 02 00 00 00 0d 00 00"
    "01 00 00 00 00 00 00 00 03 0c 00 00 00 00 00 00"
    "00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00"
    "0f 02 0f 0f 0f 0f 0f 0f f7".replace(" ", "")
)


def test_parses_a_captured_write_frame():
    frame = parse_deq_frame(CAPTURED_WRITE_FRAME)
    assert frame.direction == FrameDirection.WRITE
    assert frame.parameterId == 0x0D


def test_parses_a_captured_read_frame():
    frame = parse_deq_frame(CAPTURED_READ_FRAME)
    assert frame.direction == FrameDirection.READ
    assert frame.parameterId == 0x0D


def test_rejects_a_frame_missing_the_start_marker():
    brokenFrame = bytes([0x00]) + CAPTURED_WRITE_FRAME[1:]
    with pytest.raises(InvalidFrameError):
        parse_deq_frame(brokenFrame)


def test_rejects_a_frame_missing_the_end_marker():
    brokenFrame = CAPTURED_WRITE_FRAME[:-1] + bytes([0x00])
    with pytest.raises(InvalidFrameError):
        parse_deq_frame(brokenFrame)


def test_rejects_a_frame_with_an_unexpected_prefix():
    brokenFrame = bytearray(CAPTURED_WRITE_FRAME)
    brokenFrame[1] = 0xFF
    with pytest.raises(InvalidFrameError):
        parse_deq_frame(bytes(brokenFrame))


def test_rejects_a_frame_with_an_unknown_direction_byte():
    brokenFrame = bytearray(CAPTURED_WRITE_FRAME)
    brokenFrame[9] = 0x99
    with pytest.raises(InvalidFrameError):
        parse_deq_frame(bytes(brokenFrame))


def test_unknown_parameter_id_falls_back_to_a_raw_name():
    assert parameter_name(0x0D) == "unknown_parameter_0x0d"

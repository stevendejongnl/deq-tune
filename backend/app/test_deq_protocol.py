"""Checks the frame codec against traffic captured from a real DEQ.

The four frames below are two request and reply pairs, taken verbatim from
`captures/20260929_session_full.log` in the outer repo: the Sound & Tune
Android app talking to a physical DEQ-S1000A2 over USB.
"""

from __future__ import annotations

import pytest

from app.deq_protocol import (
    BODY_OFFSET,
    COMMAND_SPECS,
    Direction,
    InvalidFrameError,
    Message,
    decode_frame,
    decode_message,
    encode_frame,
    encode_message,
    pack_frame,
    read_field,
    unpack_frame,
)

STATUS_REQUEST = bytes.fromhex(
    "f00040060000000100010000000200000008000000000000030a"
    "0000000000000000000000000000f7"
)
STATUS_REPLY = bytes.fromhex(
    "f0004006000000010002000000020000000c000000000000030b"
    "00000000000000000000000000000000000000000000f7"
)
DRIVING_STATE_REQUEST = bytes.fromhex(
    "f00040060000000100010000000d0000000c000000000000030c"
    "00000000000000000000000000000f020f0f0f0f0f0ff7"
)
DRIVING_STATE_REPLY = bytes.fromhex(
    "f00040060000000100020000000d00000100000000000000030c"
    "000000000000000000000000000000000000000000000f020f0f0f0f0f0ff7"
)

CAPTURED_FRAMES = [
    STATUS_REQUEST,
    STATUS_REPLY,
    DRIVING_STATE_REQUEST,
    DRIVING_STATE_REPLY,
]


@pytest.mark.parametrize("frame", CAPTURED_FRAMES)
def test_a_captured_frame_survives_a_round_trip(frame: bytes) -> None:
    assert encode_frame(decode_frame(frame)) == frame


@pytest.mark.parametrize("frame", CAPTURED_FRAMES)
def test_a_captured_frame_declares_its_own_length(frame: bytes) -> None:
    assert decode_frame(frame).length_field_is_consistent


def test_a_request_reads_as_a_request() -> None:
    message = decode_frame(STATUS_REQUEST)
    assert message.direction is Direction.TO_DEVICE
    assert message.command_id == 0x02
    assert message.body == b""


def test_a_reply_reads_as_a_reply() -> None:
    message = decode_frame(STATUS_REPLY)
    assert message.direction is Direction.FROM_DEVICE
    assert message.command_id == 0x02


def test_a_reply_mirrors_the_request_transaction_id() -> None:
    assert (
        decode_frame(DRIVING_STATE_REPLY).transaction_id
        == decode_frame(DRIVING_STATE_REQUEST).transaction_id
    )


def test_a_reply_payload_is_four_bytes_longer_than_its_request() -> None:
    for request, reply in ((STATUS_REQUEST, STATUS_REPLY),
                           (DRIVING_STATE_REQUEST, DRIVING_STATE_REPLY)):
        assert len(unpack_frame(reply)) == len(unpack_frame(request)) + 4


def test_the_payload_is_nibble_expanded() -> None:
    frame = pack_frame(bytes([0xAB, 0x0F]))
    assert frame[8:12] == bytes([0x0A, 0x0B, 0x00, 0x0F])


def test_the_pad_rule_never_fires_with_the_header_this_unit_uses() -> None:
    # The app pads a frame whose size is an exact multiple of 512. With the
    # 7-byte header this unit uses, a frame is 2 * payload + 9 bytes, which is
    # always odd, so the rule can never fire. The codec keeps it because the
    # header comes from a config object and another unit could set a header
    # that makes the total even.
    for payload_length in range(248, 260):
        assert len(pack_frame(bytes(payload_length))) == payload_length * 2 + 9


def test_an_unpadded_frame_round_trips_at_every_length_near_the_pad() -> None:
    for payload_length in range(248, 258):
        payload = bytes(range(payload_length % 256)) + bytes(
            payload_length - (payload_length % 256)
        )
        assert unpack_frame(pack_frame(payload))[:payload_length] == payload


def test_a_short_frame_is_rejected() -> None:
    with pytest.raises(InvalidFrameError):
        unpack_frame(bytes([0xF0, 0x00, 0xF7]))


def test_a_frame_without_the_start_marker_is_rejected() -> None:
    with pytest.raises(InvalidFrameError):
        unpack_frame(bytes([0x00] * 20))


def test_an_unknown_direction_is_rejected() -> None:
    payload = bytearray(BODY_OFFSET)
    payload[0] = 0x09
    with pytest.raises(InvalidFrameError):
        decode_message(bytes(payload))


def test_a_truncated_payload_is_rejected() -> None:
    with pytest.raises(InvalidFrameError):
        decode_message(bytes(4))


def test_a_transaction_id_of_the_wrong_size_is_rejected() -> None:
    with pytest.raises(ValueError):
        encode_message(
            Message(Direction.TO_DEVICE, 0x02, transaction_id=bytes(4))
        )


def test_the_command_table_covers_the_commands_the_app_uses() -> None:
    # The startup sequence seen on the wire, plus the two settings commands.
    for command_id in (0x00, 0x02, 0x03, 0x04, 0x05, 0x09, 0x0A, 0x0D):
        assert command_id in COMMAND_SPECS


def test_the_equalizer_command_carries_a_config_id_and_a_configuration() -> None:
    request = COMMAND_SPECS[0x05].request
    assert request is not None
    assert [one.name for one in request.fields] == [
        "TRANSACTION_ID", "CONFIG_ID", "CONFIGURATION",
    ]
    # The enum calls CONFIGURATION 16 bytes wide, but a real equalizer write
    # carries 2080. The declared width is a floor, not the truth, so a reader
    # must take the configuration as "the rest of the payload".
    assert request.field_named("CONFIGURATION").offset == 20
    assert request.payload_bytes == 36


def test_a_fixed_width_field_reads_back_out_of_a_payload() -> None:
    specification = COMMAND_SPECS[0x05].request
    config_id_field = specification.field_named("CONFIG_ID")
    body = bytearray(8)
    body[0:4] = (13).to_bytes(4, "little")
    payload = encode_message(
        Message(Direction.TO_DEVICE, 0x05, bytes(8), bytes(body))
    )
    assert read_field(payload, config_id_field) == 13


def test_reading_past_the_end_of_a_payload_is_rejected() -> None:
    config_id_field = COMMAND_SPECS[0x05].request.field_named("CONFIG_ID")
    with pytest.raises(InvalidFrameError):
        read_field(bytes(BODY_OFFSET), config_id_field)

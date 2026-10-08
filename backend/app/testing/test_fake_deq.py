"""Checks the fake DEQ against bytes a real DEQ sent.

The fake is only worth having if it answers the way the unit does, so the
load-bearing test here replays a captured request through it and compares
its reply with the unit's own, byte for byte. `conformance/flows.json`
holds those bytes.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.deq_protocol import (
    Direction,
    Message,
    build_sync_body,
    decode_frame,
    encode_frame,
)
from app.deq_transport import TransportTimeout
from app.testing.fake_deq import FakeDeq, UnknownCommandError

CORPUS_PATH = Path(__file__).resolve().parents[3] / "conformance" / "flows.json"


def load_frame_flows() -> dict[str, dict]:
    corpus = json.loads(CORPUS_PATH.read_text())
    return {flow["name"]: flow for flow in corpus["flows"] if flow["kind"] == "frame"}


def test_the_fake_reproduces_the_real_units_reply():
    """The one check that makes this fake trustworthy.

    `frame-volume-request` and its reply are a matched pair from
    traffic with a physical DEQ-S1000A2: the same command id and the same
    transaction id. Feeding the request in has to produce the reply out.
    """
    flows = load_frame_flows()
    request_frame = bytes.fromhex(flows["frame-volume-request"]["bytesHex"])
    real_reply_hex = flows["frame-volume-reply"]["bytesHex"]

    fake = FakeDeq()
    fake.send_frame(request_frame)

    assert fake.receive_frame(1.0).hex() == real_reply_hex


def test_the_reply_length_field_is_the_requests_plus_four():
    flows = load_frame_flows()
    request = decode_frame(bytes.fromhex(flows["frame-volume-request"]["bytesHex"]))

    fake = FakeDeq()
    fake.send_frame(bytes.fromhex(flows["frame-volume-request"]["bytesHex"]))
    reply = decode_frame(fake.receive_frame(1.0))

    assert reply.declared_length == request.declared_length + 4


def test_a_volume_request_gets_its_own_value_back():
    """The capture pairs a -14 dB write with a reply carrying -14 back."""
    fake = FakeDeq()
    volume_body = bytes.fromhex("f2ffffff")
    fake.send_frame(build_request_frame(command_id=0x0D, body=volume_body))
    reply = decode_frame(fake.receive_frame(1.0))
    assert reply.body == bytes(4) + volume_body


# The sync reply a real DEQ-S1000A2 sent in the car on 2026-10-08, body
# only. STATUS 0, the 16-byte word, then volume -27, unmuted, parked.
REAL_SYNC_REPLY_BODY = bytes.fromhex(
    "000000003dd378e1054592964b2ede1fb9283b2b"
    "e5ffffff0000000000000000"
)


def test_a_sync_reply_matches_the_one_the_real_unit_sent():
    fake = FakeDeq(volume_db=-27, muted=False, driving=False)
    fake.send_frame(build_request_frame(command_id=0x00, body=build_sync_body()))
    assert decode_frame(fake.receive_frame(1.0)).body == REAL_SYNC_REPLY_BODY


def test_a_sync_with_no_body_is_refused_the_way_the_real_unit_refuses_it():
    # The real unit answered STATUS -5 and then ignored everything after.
    fake = FakeDeq()
    fake.send_frame(build_request_frame(command_id=0x00))
    reply = decode_frame(fake.receive_frame(1.0))
    assert reply.body == (-5).to_bytes(4, "little", signed=True)
    fake.send_frame(build_request_frame(command_id=0x03))
    with pytest.raises(TransportTimeout):
        fake.receive_frame(1.0)


def test_the_live_state_the_sync_reply_reports_is_tweakable():
    fake = FakeDeq(volume_db=-5, muted=True, driving=True)
    fake.send_frame(build_request_frame(command_id=0x00, body=build_sync_body()))
    body = decode_frame(fake.receive_frame(1.0)).body
    assert int.from_bytes(body[20:24], "little", signed=True) == -5
    assert int.from_bytes(body[24:28], "little") == 1
    assert int.from_bytes(body[28:32], "little") == 1


def test_a_status_fault_can_be_asked_for_by_command():
    fake = FakeDeq(status_by_command={0x03: -7})
    fake.send_frame(build_request_frame(command_id=0x03))
    reply = decode_frame(fake.receive_frame(1.0))
    assert reply.body == (-7).to_bytes(4, "little", signed=True)


def test_the_unit_can_be_told_to_go_silent_after_one_command():
    fake = FakeDeq(silent_after={0x03})
    fake.send_frame(build_request_frame(command_id=0x03))
    assert decode_frame(fake.receive_frame(1.0)).command_id == 0x03
    fake.send_frame(build_request_frame(command_id=0x04))
    with pytest.raises(TransportTimeout):
        fake.receive_frame(1.0)


def test_an_unmeasured_large_command_raises_rather_than_answering_zeros():
    """A zero-filled reply would let a test pass against behaviour no real
    unit has shown. The protocol work lost days to exactly that."""
    fake = FakeDeq()
    with pytest.raises(UnknownCommandError, match="no reply rule"):
        fake.send_frame(build_request_frame(command_id=0x7E, body=bytes(64)))


def test_a_silent_fake_never_answers():
    fake = FakeDeq(answers=False)
    fake.send_frame(build_request_frame(command_id=0x02))
    with pytest.raises(TransportTimeout):
        fake.receive_frame(0.01)


def test_a_serial_longer_than_the_field_raises():
    fake = FakeDeq(serial="THIRTEEN_CHAR")
    with pytest.raises(ValueError, match="does not fit"):
        fake.send_frame(build_request_frame(command_id=0x04))


def build_request_frame(command_id: int, body: bytes = b"") -> bytes:
    return encode_frame(
        Message(
            direction=Direction.TO_DEVICE,
            command_id=command_id,
            transaction_id=(1).to_bytes(8, "little"),
            body=body,
        )
    )

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

from app.deq_protocol import Direction, Message, decode_frame, encode_frame
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


def test_a_sync_reply_carries_no_status():
    fake = FakeDeq()
    fake.send_frame(build_request_frame(command_id=0x00))
    assert decode_frame(fake.receive_frame(1.0)).body == b""


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

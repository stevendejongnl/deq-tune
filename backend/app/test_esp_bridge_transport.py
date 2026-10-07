"""Checks the ESP bridge transport's framing, without a serial port.

Same story as `test_usb_transport.py`: this covers cutting whole frames
out of a byte stream, which is where a real link would most likely catch
this code out. The ESP relays the DEQ's own framing unchanged, so this
reuses the same frames and the same pad-byte rule.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.deq_protocol import Direction, Message, encode_frame
from app.deq_transport import (
    BULK_PACKET_BYTES,
    MAX_FRAME_BYTES,
    TransportError,
    TransportTimeout,
)
from app.esp_bridge_transport import EspBridgeTransport

CORPUS_PATH = Path(__file__).resolve().parents[2] / "conformance" / "flows.json"


def captured_frame(name: str) -> bytes:
    flows = json.loads(CORPUS_PATH.read_text())["flows"]
    return bytes.fromhex(next(flow for flow in flows if flow["name"] == name)["bytesHex"])


def build_frame(body_bytes: int) -> bytes:
    """Returns a real frame whose body is a chosen size."""
    return encode_frame(
        Message(
            direction=Direction.FROM_DEVICE,
            command_id=0x05,
            transaction_id=(1).to_bytes(8, "little"),
            body=bytes(body_bytes),
        )
    )


class FakeSerialConnection:
    """One serial port, backed by bytes in memory.

    `pyserial` returns fewer bytes than asked for -- including zero --
    when its timeout elapses, rather than raising. This fixture does the
    same; you give it the stream to serve; it depends on nothing.
    """

    def __init__(self, stream: bytes = b"") -> None:
        self.stream = bytearray(stream)
        self.written = bytearray()
        self.timeout: float = 1.0

    def read(self, chunk_bytes: int) -> bytes:
        chunk = bytes(self.stream[:chunk_bytes])
        del self.stream[: len(chunk)]
        return chunk

    def write(self, data: bytes) -> int:
        self.written += data
        return len(data)

    def close(self) -> None:
        pass


def build_transport(stream: bytes = b"") -> EspBridgeTransport:
    """Returns a transport wired to a fake serial connection, no hardware."""
    return EspBridgeTransport(port="unused", connection=FakeSerialConnection(stream))


def test_a_short_frame_arrives_in_one_read():
    frame = captured_frame("frame-status-request")
    assert len(frame) < BULK_PACKET_BYTES

    transport = build_transport(frame)

    assert transport.receive_frame(1.0) == frame


def test_a_long_frame_is_rebuilt_from_several_reads():
    """The coefficient write is 4209 bytes. A transport that treated one
    read as one frame would truncate it if the bridge split the write."""
    frame = build_frame(2080)
    assert len(frame) > BULK_PACKET_BYTES * 8

    transport = build_transport(frame)

    assert transport.receive_frame(1.0) == frame


def test_two_frames_in_one_stream_come_back_one_at_a_time():
    first = captured_frame("frame-status-request")
    second = captured_frame("frame-volume-reply")

    transport = build_transport(first + second)

    assert transport.receive_frame(1.0) == first
    assert transport.receive_frame(1.0) == second


def test_a_frame_that_fills_whole_packets_keeps_its_pad_byte():
    """`pack_frame` adds one zero byte when a frame would otherwise be an
    exact multiple of 512 -- a rule that belongs to the DEQ's own USB link,
    which the bridge relays unchanged. The reader has to take that byte
    with the frame and not leave it to confuse the next read."""
    padded = next(
        frame
        for body_bytes in range(1, 600)
        for frame in [build_frame(body_bytes)]
        if len(frame) % BULK_PACKET_BYTES == 1
    )
    following = captured_frame("frame-status-request")

    transport = build_transport(padded + following)

    assert transport.receive_frame(1.0) == padded
    assert transport.receive_frame(1.0) == following


def test_a_silent_bridge_times_out():
    """A timeout means the bridge had nothing to relay, which the session
    reports differently from a broken link."""
    transport = build_transport(b"")
    with pytest.raises(TransportTimeout, match="sent nothing"):
        transport.receive_frame(0.01)


def test_a_read_that_fails_for_another_reason_is_not_a_timeout():
    transport = build_transport()

    class BrokenConnection:
        def read(self, chunk_bytes: int) -> bytes:
            raise OSError("the port went away")

    transport.connection = BrokenConnection()
    with pytest.raises(TransportError, match="reading from the bridge failed") as caught:
        transport.receive_frame(1.0)
    assert not isinstance(caught.value, TransportTimeout)


def test_a_stream_with_no_frame_end_is_reported_not_buffered_forever():
    transport = build_transport(bytes(MAX_FRAME_BYTES + BULK_PACKET_BYTES))
    with pytest.raises(TransportError, match="out of step"):
        transport.receive_frame(1.0)


def test_sending_writes_the_whole_frame():
    frame = captured_frame("frame-status-request")
    transport = build_transport()

    transport.send_frame(frame)

    assert bytes(transport.connection.written) == frame


def test_a_short_write_is_an_error():
    transport = build_transport()

    class ShortConnection:
        def write(self, data: bytes) -> int:
            return len(data) - 1

    transport.connection = ShortConnection()
    with pytest.raises(TransportError, match="wrote"):
        transport.send_frame(captured_frame("frame-status-request"))


def test_closing_twice_is_safe():
    transport = build_transport()
    transport.close()
    transport.close()
    assert transport.closed

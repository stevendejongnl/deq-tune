"""Checks the session against a DEQ that answers like the real one."""

from __future__ import annotations

import pytest

from app.deq_blob import UserConfiguration
from app.deq_protocol import Direction, Message, decode_frame, encode_frame
from app.deq_session import (
    COMMAND_KEEPALIVE,
    STARTUP_STEPS,
    DeqSession,
    DeviceStatusError,
    ReplyMismatchError,
    SessionTimeoutError,
)
from app.deq_transport import TransportTimeout
from app.testing.fake_deq import FAKE_SERIAL, FakeDeq


def test_start_sends_the_apps_own_connect_order():
    fake = FakeDeq()
    DeqSession(fake).start()
    assert fake.command_order == [command_id for command_id, _ in STARTUP_STEPS]


def test_each_request_carries_a_new_transaction_id():
    fake = FakeDeq()
    session = DeqSession(fake)
    session.send_keepalive()
    session.send_keepalive()
    first, second = (one.request.transaction_id for one in fake.exchanges)
    assert first != second


def test_the_unit_mirrors_the_transaction_id_back():
    """The capture shows every reply carrying the request's own id."""
    fake = FakeDeq()
    DeqSession(fake).send_keepalive()
    exchange = fake.exchanges[0]
    assert exchange.reply.transaction_id == exchange.request.transaction_id


def test_read_device_identity_reports_what_the_unit_says():
    fake = FakeDeq(firmware_version=0x0310)
    identity = DeqSession(fake).read_device_identity()
    assert identity.firmware_version == 0x0310
    assert identity.serial == FAKE_SERIAL


def test_a_written_configuration_reads_back():
    fake = FakeDeq()
    session = DeqSession(fake)
    configuration = UserConfiguration(bank_in_use=1, equalizer_enabled=1)
    configuration.bank_a_gains_db[0] = 6.0

    session.write_user_configuration(configuration)
    read_back = session.read_user_configuration()

    assert read_back.bank_in_use == 1
    assert read_back.equalizer_enabled == 1
    assert read_back.bank_a_gains_db[0] == pytest.approx(6.0)


def test_a_coefficient_write_is_acknowledged_not_echoed():
    """A 2100-byte write gets a 24-byte reply. Echoing the block back is
    what the real app refuses with `[Code:601]`."""
    fake = FakeDeq()
    session = DeqSession(fake)

    session.write_coefficients(config_id=13, configuration=bytes(2080))

    reply = fake.exchanges[0].reply
    assert fake.exchanges[0].request.payload_length == 2100
    assert reply.payload_length == 24


def test_volume_sends_a_signed_value():
    """The capture's own volume frame carries -14 as `f2ffffff`."""
    fake = FakeDeq()
    DeqSession(fake).set_volume(-14)
    assert fake.exchanges[0].request.body == bytes.fromhex("f2ffffff")


def test_a_reply_to_another_command_raises():
    session = DeqSession(ReplyingTransport(command_id_shift=1))
    with pytest.raises(ReplyMismatchError, match="got a reply to"):
        session.send_keepalive()


def test_a_reply_carrying_another_transaction_id_raises():
    session = DeqSession(ReplyingTransport(transaction_id_shift=1))
    with pytest.raises(ReplyMismatchError, match="transaction id"):
        session.send_keepalive()


def test_a_silent_unit_times_out():
    session = DeqSession(FakeDeq(answers=False), timeout_seconds=0.01)
    with pytest.raises(SessionTimeoutError, match="no reply"):
        session.send_keepalive()


def test_a_refused_request_raises_with_its_status():
    session = DeqSession(ReplyingTransport(status=5))
    with pytest.raises(DeviceStatusError) as caught:
        session.send_keepalive()
    assert caught.value.status == 5
    assert caught.value.command_id == COMMAND_KEEPALIVE


def test_close_releases_the_link():
    fake = FakeDeq()
    DeqSession(fake).close()
    assert fake.closed


class ReplyingTransport:
    """Answers every request, with one chosen thing wrong.

    It replies to whatever it is sent; you set one shift or status in the
    constructor; it depends on `deq_protocol` to build the reply. The
    session's own checks are what these shifts are meant to trip.
    """

    def __init__(
        self,
        command_id_shift: int = 0,
        transaction_id_shift: int = 0,
        status: int = 0,
    ) -> None:
        self.command_id_shift = command_id_shift
        self.transaction_id_shift = transaction_id_shift
        self.status = status
        self._pending_reply: bytes | None = None
        self.closed = False

    def send_frame(self, frame: bytes) -> None:
        request = decode_frame(frame)
        transaction_id = (
            int.from_bytes(request.transaction_id, "little") + self.transaction_id_shift
        )
        self._pending_reply = encode_frame(
            Message(
                direction=Direction.FROM_DEVICE,
                command_id=request.command_id + self.command_id_shift,
                transaction_id=transaction_id.to_bytes(8, "little"),
                body=self.status.to_bytes(4, "little"),
            )
        )

    def receive_frame(self, timeout_seconds: float) -> bytes:
        if self._pending_reply is None:
            raise TransportTimeout("nothing to send")
        frame = self._pending_reply
        self._pending_reply = None
        return frame

    def close(self) -> None:
        self.closed = True

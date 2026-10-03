"""Checks the session against a DEQ that answers like the real one."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.deq_blob import UserConfiguration
from app.deq_dsp import FilterSlope, build_equalizer_payload
from app.deq_protocol import Direction, Message, decode_frame, encode_frame
from app.deq_session import (
    COMMAND_KEEPALIVE,
    CONFIG_ID_CROSSOVER_STANDARD,
    CONFIG_ID_EQUALIZER,
    CONFIG_ID_TIME_ALIGNMENT,
    STARTUP_STEPS,
    DeqSession,
    DeviceStatusError,
    ReplyMismatchError,
    SessionTimeoutError,
    cancelled_band_gains_db,
    crossover_slot_inputs,
    selected_band_gains_db,
    speaker_distances_mm,
)
from app.eq_data import TuningData
from app.deq_transport import TransportTimeout
from app.testing.fake_deq import FAKE_SERIAL, FAKE_SPEAKER_MODE, FakeDeq


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
    assert identity.speaker_mode == FAKE_SPEAKER_MODE


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


def test_write_tuning_sends_three_blocks_under_the_right_config_ids():
    """Each CONFIG_ID's payload size has to match the width the APK's own
    field enum declares for it, or the unit refuses the frame."""
    fake = FakeDeq()
    DeqSession(fake).write_tuning(load_factory_tuning())

    sent = [
        (int.from_bytes(one.request.body[:4], "little"), one.request.payload_length)
        for one in fake.exchanges
    ]
    assert sent == [
        (CONFIG_ID_EQUALIZER, 2100),
        (CONFIG_ID_TIME_ALIGNMENT, 52),
        (CONFIG_ID_CROSSOVER_STANDARD, 204),
    ]
    assert {one.request.command_id for one in fake.exchanges} == {0x05}


def test_the_equalizer_block_matches_what_deq_dsp_builds():
    """The session must not transform the gains on the way through."""
    tuning = load_factory_tuning()
    fake = FakeDeq()
    DeqSession(fake).write_equalizer(tuning)

    gains_db = selected_band_gains_db(tuning)
    expected = build_equalizer_payload(cancelled_band_gains_db(tuning, gains_db), gains_db)
    assert fake.exchanges[0].request.body[4:] == expected


def test_a_profile_with_no_cancelling_data_sends_the_same_curve_twice():
    tuning = load_factory_tuning()
    assert not tuning.factoryCancel.enabled
    gains_db = selected_band_gains_db(tuning)
    assert cancelled_band_gains_db(tuning, gains_db) == gains_db


def test_distances_come_through_in_millimetres_with_five_slots():
    """The profile stores centimetres for four speakers; the library wants
    millimetres for five."""
    tuning = load_factory_tuning()
    distances_mm = speaker_distances_mm(tuning)
    assert len(distances_mm) == 5
    assert distances_mm[0] == round(tuning.speakers["FL"].timeAlignmentCm * 10)
    assert distances_mm[4] == max(distances_mm)


def test_the_crossover_reads_the_profiles_positions_not_hertz():
    """`cutoff_hpf` is an index into the cutoff table, not a frequency. A
    factory preset's rear filter stores 9 and 2, meaning 200 Hz at 12 dB."""
    tuning = load_factory_tuning()
    tuning.filter.rear.cutoff_hpf = 9
    tuning.filter.rear.slope_hpf = 2

    cutoff_positions, slopes = crossover_slot_inputs(tuning)

    assert cutoff_positions[1] == 9
    assert slopes[1] is FilterSlope.SLOPE_12
    assert slopes[2:] == [FilterSlope.PASS] * 3


def test_an_unknown_layout_raises():
    with pytest.raises(ValueError, match="unknown crossover layout"):
        DeqSession(FakeDeq()).write_crossover(load_factory_tuning(), "quadraphonic")


def test_a_profile_selecting_a_bank_it_does_not_have_raises():
    tuning = load_factory_tuning()
    slot = tuning.foundationEq.eqs["LR"]
    slot.selectedBank = len(slot.banks)
    with pytest.raises(ValueError, match="selects bank"):
        selected_band_gains_db(tuning)


def load_factory_tuning() -> TuningData:
    """Returns one bundled factory preset, as shipped."""
    preset_path = (
        Path(__file__).resolve().parents[2]
        / "data"
        / "presets"
        / "mazda"
        / "tuning_preset_model_mazda_3_carrozzeria.json"
    )
    return TuningData.model_validate(json.loads(preset_path.read_text()))


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

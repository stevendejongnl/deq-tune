"""Checks the blob codec against a blob the Android app itself wrote.

`deq_blob_reference.json` holds the 572 bytes the app's own serializer
(`b/g/h`) produced for a default configuration in speaker mode
`STANDARD_FL_FR_RL_RR_SW`, read out of the running app over Frida.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.deq_blob import (
    BANK_BAND_SLOTS,
    CANCELLING_BAND_COUNT,
    CROSSOVER_SPEAKER_COUNT,
    NAME_BYTES,
    SPEAKER_RECORD_COUNT,
    SPEAKER_RECORD_OFFSET,
    SPEAKER_RECORD_STRIDE,
    SPEAKER_SEPARATOR_COUNT,
    STANDARD_BLOB_BYTES,
    BlobLengthError,
    CrossoverSetting,
    SpeakerRecord,
    UserConfiguration,
    decode_blob,
    encode_blob,
    trim_gains_to_band_count,
)


def load_default_blob() -> bytes:
    path = Path(__file__).parent / "deq_blob_reference.json"
    return bytes.fromhex(json.loads(path.read_text())["default_standard_fl_fr_rl_rr_sw"])


def load_edited_blob() -> bytes:
    path = Path(__file__).parent / "deq_blob_reference.json"
    return bytes.fromhex(json.loads(path.read_text())["edited_standard_fl_fr_rl_rr_sw"])


DEFAULT_BLOB = load_default_blob()
# Built by this codec, then read and rewritten by the app's own codec on a
# running device. The app reproduced it byte for byte.
EDITED_BLOB = load_edited_blob()


def test_the_reference_blob_is_the_length_the_app_writes() -> None:
    assert len(DEFAULT_BLOB) == STANDARD_BLOB_BYTES


def test_the_reference_blob_survives_a_round_trip() -> None:
    assert encode_blob(decode_blob(DEFAULT_BLOB)) == DEFAULT_BLOB


def test_the_reference_blob_reads_as_the_app_s_defaults() -> None:
    configuration = decode_blob(DEFAULT_BLOB)
    assert configuration.version == 3
    assert configuration.speaker_mode == 3
    assert configuration.listening_position == 2
    assert configuration.band_count == 31
    assert configuration.equalizer_enabled == 0
    assert configuration.bank_in_use == 0
    assert configuration.source_type == 0xFF
    assert configuration.bank_flag_b == 1


def test_a_default_blob_has_flat_banks() -> None:
    configuration = decode_blob(DEFAULT_BLOB)
    assert configuration.bank_a_gains_db == [0.0] * BANK_BAND_SLOTS
    assert configuration.bank_b_gains_db == [0.0] * BANK_BAND_SLOTS


def test_a_separator_byte_follows_every_record_but_the_last() -> None:
    # The app writes 0x01 in the byte that follows the first record's floats.
    assert DEFAULT_BLOB[SPEAKER_RECORD_OFFSET + 12] == 1
    speakers = decode_blob(DEFAULT_BLOB).speakers
    assert speakers[0].separator == 1
    # The last record ends at 369; offset 370 belongs to the cancelling
    # equalizer, so that record has no separator of its own.
    assert speakers[-1].separator is None


def test_the_speaker_records_are_thirteen_bytes_apart() -> None:
    configuration = UserConfiguration()
    configuration.speakers = [
        SpeakerRecord(
            float(slot), 0.0, 0.0,
            slot if slot < SPEAKER_SEPARATOR_COUNT else None,
        )
        for slot in range(SPEAKER_RECORD_COUNT)
    ]
    blob = encode_blob(configuration)
    for slot in range(SPEAKER_SEPARATOR_COUNT):
        start = SPEAKER_RECORD_OFFSET + slot * SPEAKER_RECORD_STRIDE
        assert blob[start + 12] == slot
    assert decode_blob(blob).speakers == configuration.speakers


def test_a_separator_on_the_last_record_is_rejected() -> None:
    configuration = UserConfiguration()
    configuration.speakers[-1].separator = 0
    with pytest.raises(ValueError):
        encode_blob(configuration)


def test_band_gains_are_little_endian_float32() -> None:
    configuration = UserConfiguration()
    configuration.bank_a_gains_db[0] = 6.0
    blob = encode_blob(configuration)
    assert blob[18:22] == bytes([0x00, 0x00, 0xC0, 0x40])


def test_every_field_survives_a_round_trip() -> None:
    configuration = UserConfiguration(
        version=3,
        timestamp_seconds=1_759_300_000,
        speaker_mode=3,
        listening_position=1,
        unknown_flag_14=1,
        equalizer_enabled=1,
        band_count=13,
        bank_in_use=1,
        bank_a_gains_db=[float(band) / 2 for band in range(BANK_BAND_SLOTS)],
        bank_b_gains_db=[-float(band) / 4 for band in range(BANK_BAND_SLOTS)],
        preset_index_a=2,
        preset_index_b=3,
        bank_flag_b=1,
        bank_flag_c=1,
        sound_field=4,
        unknown_flag_279=1,
        crossovers=[
            CrossoverSetting(frequency=index + 1, slope=index + 2)
            for index in range(CROSSOVER_SPEAKER_COUNT)
        ],
        speakers=[
            SpeakerRecord(
                float(slot), float(slot) * 2, float(slot) * 3,
                slot if slot < SPEAKER_SEPARATOR_COUNT else None,
            )
            for slot in range(SPEAKER_RECORD_COUNT)
        ],
        cancelling_flag_a=1,
        cancelling_flag_b=1,
        cancelling_left_db=[0.5] * CANCELLING_BAND_COUNT,
        cancelling_right_db=[-0.5] * CANCELLING_BAND_COUNT,
        manual_left=1.25,
        manual_right=-1.25,
        name_bytes=bytes(range(NAME_BYTES)),
        source_type=2,
        bank_type=7,
        model_value=9,
        unknown_block=bytes(range(16)),
        trailing_flag=1,
        trailing_bytes=bytes(range(32)),
    )
    assert decode_blob(encode_blob(configuration)) == configuration


def test_a_blob_of_the_wrong_length_is_rejected() -> None:
    with pytest.raises(BlobLengthError):
        decode_blob(bytes(546))


def test_a_wrong_band_count_is_rejected() -> None:
    configuration = UserConfiguration()
    configuration.bank_a_gains_db = [0.0] * 13
    with pytest.raises(ValueError):
        encode_blob(configuration)


def test_a_wrong_speaker_count_is_rejected() -> None:
    configuration = UserConfiguration()
    configuration.speakers = [SpeakerRecord()] * 5
    with pytest.raises(ValueError):
        encode_blob(configuration)


def test_a_name_region_of_the_wrong_size_is_rejected() -> None:
    configuration = UserConfiguration()
    configuration.name_bytes = b"short"
    with pytest.raises(ValueError):
        encode_blob(configuration)


def test_the_edited_blob_survives_a_round_trip() -> None:
    assert encode_blob(decode_blob(EDITED_BLOB)) == EDITED_BLOB


def test_the_edited_blob_holds_the_values_it_was_built_with() -> None:
    configuration = decode_blob(EDITED_BLOB)
    assert configuration.equalizer_enabled == 1
    assert configuration.listening_position == 1
    assert configuration.band_count == 31
    assert configuration.bank_a_gains_db[0] == 6.0
    assert configuration.bank_a_gains_db[15] == -3.5
    assert configuration.bank_b_gains_db[30] == 1.25
    assert configuration.speakers[0].first == 2.0
    assert configuration.speakers[6].third == -4.0
    assert configuration.crossovers[3] == CrossoverSetting(frequency=5, slope=2)
    assert configuration.cancelling_left_db[2] == 1.5
    assert configuration.source_type == 1


def test_trimming_drops_the_gains_above_the_band_count() -> None:
    configuration = UserConfiguration()
    configuration.band_count = 13
    configuration.bank_a_gains_db[0] = 6.0
    configuration.bank_a_gains_db[15] = -3.5
    configuration.bank_b_gains_db[30] = 1.0
    trim_gains_to_band_count(configuration)
    assert configuration.bank_a_gains_db[0] == 6.0
    assert configuration.bank_a_gains_db[15] == 0.0
    assert configuration.bank_b_gains_db[30] == 0.0


def test_trimming_leaves_a_thirty_one_band_profile_alone() -> None:
    configuration = UserConfiguration()
    configuration.bank_a_gains_db[30] = 2.0
    trim_gains_to_band_count(configuration)
    assert configuration.bank_a_gains_db[30] == 2.0

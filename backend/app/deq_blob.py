"""Reads and writes the DEQ's USER_CONFIGURATION blob.

The blob is the unit's whole semantic state: which speakers it drives, the
band gains of both equalizer banks, the crossover settings, the per-speaker
levels and delays. Command 0x09 reads it and command 0x08 writes it back.

The coefficients in command 0x05 are what the DSP acts on, so a profile has
to send both. See `deq_dsp.py` for the coefficient side.

The layout was mapped by changing one setting at a time in the Android app
and diffing the bytes it wrote, against a single baseline: speaker mode
`STANDARD_FL_FR_RL_RR_SW`, blob version 3, 572 bytes. A NETWORK mode writes
two speaker records fewer and so runs 26 bytes shorter; this module reads
and writes the STANDARD form only.

Four fields are known by position but not by meaning: the flags at offsets
14 and 279, the 16 bytes at 523, and the 32-byte string region at 484. The
string region is written from a Java string array whose encoding is not
settled, so this module carries it as raw bytes rather than guessing at
text.

**A bank always reserves 31 slots, but `band_count` says how many the unit
reads.** Set `band_count` to 13 and the app drops whatever stands in slots
13 to 30. Write a gain above the band count and it will not survive the
unit's next write. `trim_gains_to_band_count` does that trimming here, so a
caller can see it happen instead of losing the value later.
"""

from __future__ import annotations

import struct
from dataclasses import dataclass, field

BLOB_VERSION = 3
STANDARD_BLOB_BYTES = 572

VERSION_OFFSET = 0
TIMESTAMP_OFFSET = 4
SPEAKER_MODE_OFFSET = 12
LISTENING_POSITION_OFFSET = 13
UNKNOWN_FLAG_OFFSET = 14
EQUALIZER_ENABLED_OFFSET = 15
BAND_COUNT_OFFSET = 16
BANK_IN_USE_OFFSET = 17

BANK_A_OFFSET = 18
BANK_B_OFFSET = 142
BANK_BAND_SLOTS = 31
BANK_BYTES = BANK_BAND_SLOTS * 4

PRESET_INDEX_A_OFFSET = 266
PRESET_INDEX_B_OFFSET = 267
BANK_FLAG_B_OFFSET = 268
BANK_FLAG_C_OFFSET = 269
SOUND_FIELD_OFFSET = 270

CROSSOVER_OFFSET = 271
CROSSOVER_SPEAKER_COUNT = 4
# One byte sits between the crossover block and the speaker records. The app
# writes 1 there by default; what it means is not known.
UNKNOWN_FLAG_279_OFFSET = 279

SPEAKER_RECORD_OFFSET = 280
SPEAKER_RECORD_COUNT = 7
# Each record is three float32. A single byte separates one record from the
# next, so there are six of those bytes, not seven: the last record ends at
# 369 and offset 370 already belongs to the cancelling equalizer.
SPEAKER_RECORD_STRIDE = 13
SPEAKER_SEPARATOR_COUNT = SPEAKER_RECORD_COUNT - 1

CANCELLING_FLAG_A_OFFSET = 370
CANCELLING_FLAG_B_OFFSET = 371
CANCELLING_LEFT_OFFSET = 372
CANCELLING_RIGHT_OFFSET = 424
CANCELLING_BAND_COUNT = 13

MANUAL_LEFT_OFFSET = 476
MANUAL_RIGHT_OFFSET = 480

NAME_OFFSET = 484
NAME_BYTES = 32

SOURCE_TYPE_OFFSET = 516
BANK_TYPE_OFFSET = 517
MODEL_VALUE_OFFSET = 519
UNKNOWN_BLOCK_OFFSET = 523
UNKNOWN_BLOCK_BYTES = 16
TRAILING_FLAG_OFFSET = 539
TRAILING_BYTES_OFFSET = 540
TRAILING_BYTES = 32

# The order the blob reserves a record for, in a STANDARD speaker mode. A
# mode that does not drive a position still reserves its record, so the slot
# is a position in this list, not an enum ordinal.
STANDARD_SPEAKER_ORDER = (
    "FRONT_L", "FRONT_R", "REAR_L", "REAR_R", "REAR_L_SW", "REAR_R_SW", "SW",
)

# Which side of the crossover each speaker type uses. A front or rear speaker
# only ever gets a high pass, a subwoofer only ever a low pass.
CROSSOVER_SPEAKER_TYPES = (
    "STANDARD_FRONT", "STANDARD_REAR", "STANDARD_REARSW", "SUBWOOFER",
)


class BlobLengthError(ValueError):
    """Raised when a blob is not the length this module can read."""


@dataclass
class SpeakerRecord:
    """One speaker's three stored values.

    `separator` is the byte that follows the floats and precedes the next
    record. The last record has no such byte, so its `separator` is None.
    """

    first: float = 0.0
    second: float = 0.0
    third: float = 0.0
    separator: int | None = 0


@dataclass
class CrossoverSetting:
    """One speaker type's stored crossover, as two enum positions."""

    frequency: int = 0
    slope: int = 0


@dataclass
class UserConfiguration:
    """The whole blob, field by field."""

    version: int = BLOB_VERSION
    timestamp_seconds: int = 0
    speaker_mode: int = 3
    listening_position: int = 2
    unknown_flag_14: int = 0
    equalizer_enabled: int = 0
    band_count: int = BANK_BAND_SLOTS
    bank_in_use: int = 0
    bank_a_gains_db: list[float] = field(
        default_factory=lambda: [0.0] * BANK_BAND_SLOTS
    )
    bank_b_gains_db: list[float] = field(
        default_factory=lambda: [0.0] * BANK_BAND_SLOTS
    )
    preset_index_a: int = 0
    preset_index_b: int = 0
    bank_flag_b: int = 1
    bank_flag_c: int = 0
    sound_field: int = 0
    unknown_flag_279: int = 1
    crossovers: list[CrossoverSetting] = field(
        default_factory=lambda: [
            CrossoverSetting() for _ in range(CROSSOVER_SPEAKER_COUNT)
        ]
    )
    speakers: list[SpeakerRecord] = field(default_factory=lambda: _default_speakers())
    cancelling_flag_a: int = 0
    cancelling_flag_b: int = 0
    cancelling_left_db: list[float] = field(
        default_factory=lambda: [0.0] * CANCELLING_BAND_COUNT
    )
    cancelling_right_db: list[float] = field(
        default_factory=lambda: [0.0] * CANCELLING_BAND_COUNT
    )
    manual_left: float = 0.0
    manual_right: float = 0.0
    # 484..515. Written from a Java string array whose encoding is unsettled.
    name_bytes: bytes = bytes(NAME_BYTES)
    source_type: int = 0xFF
    bank_type: int = 0
    model_value: int = 0
    # 523..538. Position known, meaning not.
    unknown_block: bytes = bytes(UNKNOWN_BLOCK_BYTES)
    trailing_flag: int = 0
    trailing_bytes: bytes = bytes(TRAILING_BYTES)


def trim_gains_to_band_count(configuration: UserConfiguration) -> UserConfiguration:
    """Zeroes every band gain the unit will ignore.

    The unit reads `band_count` bands and leaves the rest of the 31 slots
    alone, so a gain above that count is dropped on its next write. Applying
    this first keeps what is sent and what comes back the same.
    """
    for gains in (configuration.bank_a_gains_db, configuration.bank_b_gains_db):
        for slot in range(configuration.band_count, BANK_BAND_SLOTS):
            gains[slot] = 0.0
    return configuration


def _default_speakers() -> list[SpeakerRecord]:
    """Returns one empty record per slot, with no separator on the last one."""
    return [
        SpeakerRecord(separator=0 if slot < SPEAKER_SEPARATOR_COUNT else None)
        for slot in range(SPEAKER_RECORD_COUNT)
    ]


def _read_floats(blob: bytes, offset: int, count: int) -> list[float]:
    return list(struct.unpack_from(f"<{count}f", blob, offset))


def _write_floats(blob: bytearray, offset: int, values: list[float], count: int) -> None:
    if len(values) != count:
        raise ValueError(f"expected {count} values at offset {offset}, got {len(values)}")
    struct.pack_into(f"<{count}f", blob, offset, *values)


def decode_blob(blob: bytes) -> UserConfiguration:
    """Returns the configuration one STANDARD-mode blob holds."""
    if len(blob) != STANDARD_BLOB_BYTES:
        raise BlobLengthError(
            f"expected {STANDARD_BLOB_BYTES} bytes, got {len(blob)}; "
            "a NETWORK speaker mode writes a shorter blob and is not supported"
        )
    return UserConfiguration(
        version=int.from_bytes(blob[VERSION_OFFSET:VERSION_OFFSET + 4], "little"),
        timestamp_seconds=int.from_bytes(
            blob[TIMESTAMP_OFFSET:TIMESTAMP_OFFSET + 8], "little"
        ),
        speaker_mode=blob[SPEAKER_MODE_OFFSET],
        listening_position=blob[LISTENING_POSITION_OFFSET],
        unknown_flag_14=blob[UNKNOWN_FLAG_OFFSET],
        equalizer_enabled=blob[EQUALIZER_ENABLED_OFFSET],
        band_count=blob[BAND_COUNT_OFFSET],
        bank_in_use=blob[BANK_IN_USE_OFFSET],
        bank_a_gains_db=_read_floats(blob, BANK_A_OFFSET, BANK_BAND_SLOTS),
        bank_b_gains_db=_read_floats(blob, BANK_B_OFFSET, BANK_BAND_SLOTS),
        preset_index_a=blob[PRESET_INDEX_A_OFFSET],
        preset_index_b=blob[PRESET_INDEX_B_OFFSET],
        bank_flag_b=blob[BANK_FLAG_B_OFFSET],
        bank_flag_c=blob[BANK_FLAG_C_OFFSET],
        sound_field=blob[SOUND_FIELD_OFFSET],
        unknown_flag_279=blob[UNKNOWN_FLAG_279_OFFSET],
        crossovers=[
            CrossoverSetting(
                frequency=blob[CROSSOVER_OFFSET + index * 2],
                slope=blob[CROSSOVER_OFFSET + index * 2 + 1],
            )
            for index in range(CROSSOVER_SPEAKER_COUNT)
        ],
        speakers=[_read_speaker_record(blob, slot) for slot in range(SPEAKER_RECORD_COUNT)],
        cancelling_flag_a=blob[CANCELLING_FLAG_A_OFFSET],
        cancelling_flag_b=blob[CANCELLING_FLAG_B_OFFSET],
        cancelling_left_db=_read_floats(
            blob, CANCELLING_LEFT_OFFSET, CANCELLING_BAND_COUNT
        ),
        cancelling_right_db=_read_floats(
            blob, CANCELLING_RIGHT_OFFSET, CANCELLING_BAND_COUNT
        ),
        manual_left=struct.unpack_from("<f", blob, MANUAL_LEFT_OFFSET)[0],
        manual_right=struct.unpack_from("<f", blob, MANUAL_RIGHT_OFFSET)[0],
        name_bytes=blob[NAME_OFFSET:NAME_OFFSET + NAME_BYTES],
        source_type=blob[SOURCE_TYPE_OFFSET],
        bank_type=int.from_bytes(blob[BANK_TYPE_OFFSET:BANK_TYPE_OFFSET + 2], "little"),
        model_value=int.from_bytes(
            blob[MODEL_VALUE_OFFSET:MODEL_VALUE_OFFSET + 4], "little"
        ),
        unknown_block=blob[
            UNKNOWN_BLOCK_OFFSET:UNKNOWN_BLOCK_OFFSET + UNKNOWN_BLOCK_BYTES
        ],
        trailing_flag=blob[TRAILING_FLAG_OFFSET],
        trailing_bytes=blob[TRAILING_BYTES_OFFSET:TRAILING_BYTES_OFFSET + TRAILING_BYTES],
    )


def _read_speaker_record(blob: bytes, slot: int) -> SpeakerRecord:
    start = SPEAKER_RECORD_OFFSET + slot * SPEAKER_RECORD_STRIDE
    first, second, third = struct.unpack_from("<3f", blob, start)
    separator = blob[start + 12] if slot < SPEAKER_SEPARATOR_COUNT else None
    return SpeakerRecord(first, second, third, separator)


def encode_blob(configuration: UserConfiguration) -> bytes:
    """Returns the 572 bytes one configuration writes."""
    blob = bytearray(STANDARD_BLOB_BYTES)
    blob[VERSION_OFFSET:VERSION_OFFSET + 4] = configuration.version.to_bytes(4, "little")
    blob[TIMESTAMP_OFFSET:TIMESTAMP_OFFSET + 8] = (
        configuration.timestamp_seconds.to_bytes(8, "little")
    )
    blob[SPEAKER_MODE_OFFSET] = configuration.speaker_mode
    blob[LISTENING_POSITION_OFFSET] = configuration.listening_position
    blob[UNKNOWN_FLAG_OFFSET] = configuration.unknown_flag_14
    blob[EQUALIZER_ENABLED_OFFSET] = configuration.equalizer_enabled
    blob[BAND_COUNT_OFFSET] = configuration.band_count
    blob[BANK_IN_USE_OFFSET] = configuration.bank_in_use

    _write_floats(blob, BANK_A_OFFSET, configuration.bank_a_gains_db, BANK_BAND_SLOTS)
    _write_floats(blob, BANK_B_OFFSET, configuration.bank_b_gains_db, BANK_BAND_SLOTS)

    blob[PRESET_INDEX_A_OFFSET] = configuration.preset_index_a
    blob[PRESET_INDEX_B_OFFSET] = configuration.preset_index_b
    blob[BANK_FLAG_B_OFFSET] = configuration.bank_flag_b
    blob[BANK_FLAG_C_OFFSET] = configuration.bank_flag_c
    blob[SOUND_FIELD_OFFSET] = configuration.sound_field
    blob[UNKNOWN_FLAG_279_OFFSET] = configuration.unknown_flag_279

    _write_crossovers(blob, configuration.crossovers)
    _write_speaker_records(blob, configuration.speakers)

    blob[CANCELLING_FLAG_A_OFFSET] = configuration.cancelling_flag_a
    blob[CANCELLING_FLAG_B_OFFSET] = configuration.cancelling_flag_b
    _write_floats(
        blob, CANCELLING_LEFT_OFFSET, configuration.cancelling_left_db,
        CANCELLING_BAND_COUNT,
    )
    _write_floats(
        blob, CANCELLING_RIGHT_OFFSET, configuration.cancelling_right_db,
        CANCELLING_BAND_COUNT,
    )
    struct.pack_into("<f", blob, MANUAL_LEFT_OFFSET, configuration.manual_left)
    struct.pack_into("<f", blob, MANUAL_RIGHT_OFFSET, configuration.manual_right)

    _write_fixed_bytes(blob, NAME_OFFSET, configuration.name_bytes, NAME_BYTES, "name")
    blob[SOURCE_TYPE_OFFSET] = configuration.source_type
    blob[BANK_TYPE_OFFSET:BANK_TYPE_OFFSET + 2] = configuration.bank_type.to_bytes(
        2, "little"
    )
    blob[MODEL_VALUE_OFFSET:MODEL_VALUE_OFFSET + 4] = (
        configuration.model_value.to_bytes(4, "little")
    )
    _write_fixed_bytes(
        blob, UNKNOWN_BLOCK_OFFSET, configuration.unknown_block,
        UNKNOWN_BLOCK_BYTES, "unknown block",
    )
    blob[TRAILING_FLAG_OFFSET] = configuration.trailing_flag
    _write_fixed_bytes(
        blob, TRAILING_BYTES_OFFSET, configuration.trailing_bytes,
        TRAILING_BYTES, "trailing bytes",
    )
    return bytes(blob)


def _write_crossovers(blob: bytearray, crossovers: list[CrossoverSetting]) -> None:
    if len(crossovers) != CROSSOVER_SPEAKER_COUNT:
        raise ValueError(
            f"expected {CROSSOVER_SPEAKER_COUNT} crossovers, got {len(crossovers)}"
        )
    for index, crossover in enumerate(crossovers):
        blob[CROSSOVER_OFFSET + index * 2] = crossover.frequency
        blob[CROSSOVER_OFFSET + index * 2 + 1] = crossover.slope


def _write_speaker_records(blob: bytearray, speakers: list[SpeakerRecord]) -> None:
    if len(speakers) != SPEAKER_RECORD_COUNT:
        raise ValueError(
            f"expected {SPEAKER_RECORD_COUNT} speaker records, got {len(speakers)}"
        )
    for slot, speaker in enumerate(speakers):
        start = SPEAKER_RECORD_OFFSET + slot * SPEAKER_RECORD_STRIDE
        struct.pack_into(
            "<3f", blob, start, speaker.first, speaker.second, speaker.third
        )
        wants_separator = slot < SPEAKER_SEPARATOR_COUNT
        if wants_separator != (speaker.separator is not None):
            raise ValueError(
                f"speaker record {slot} "
                f"{'needs' if wants_separator else 'must not have'} a separator"
            )
        if speaker.separator is not None:
            blob[start + 12] = speaker.separator


def _write_fixed_bytes(
    blob: bytearray, offset: int, value: bytes, width: int, label: str
) -> None:
    if len(value) != width:
        raise ValueError(f"{label} must be {width} bytes, got {len(value)}")
    blob[offset:offset + width] = value

"""Builds the DSP coefficients the Pioneer DEQ expects.

The DEQ does no filter design of its own. The Sound & Tune app computes every
coefficient and sends the finished numbers. To replace that app, this module
computes the same numbers.

The rules here are not guesses. The app ships its designer as
`libOpalParameterJNI.so` and calls it through
`jp.pioneer.mle.pmg.util.OpalParameter`. That class was called directly over
Frida with known inputs, and the output of this module matches it to within
one Q27 step. `deq_dsp_reference.json` holds those captured input/output
pairs; `test_deq_dsp.py` checks every one of them.

The equalizer needs one step more than a filter design. The library spreads
every band's gain over the other bands before it designs a biquad, so a
curve with two raised bands is not two independent peakers. Its
`fittingEqGain` function does that step, from three constant tables. This
module reproduces it in `fit_equalizer_gains`, and matches the library's own
output to 1e-14 dB over every gain the sliders can send.

See `USB_CAPTURE_NOTES.md` in the outer repo for how the values were read
off the unit and the library.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import Enum

# The unit stores every coefficient as a signed 32-bit Q27 fixed-point value:
# 2 ** 27 means 1.0.
Q27_UNITY = 1 << 27

# The equalizer runs at 44100 Hz, the crossover at 48000 Hz. The two rates
# disagree, which looks wrong but is what the library does. Producing the same
# bytes the app produces matters more than picking one rate.
EQUALIZER_SAMPLE_RATE = 44100
CROSSOVER_SAMPLE_RATE = 48000

# Every equalizer band shares one Q and sits on a fixed centre frequency.
EQUALIZER_BAND_CENTRES_HZ = (
    50, 80, 125, 200, 315, 500, 800, 1250, 2000, 3150, 5000, 8000, 12500,
)
EQUALIZER_Q = 4.7

# One block holds four channels of the same curve.
EQUALIZER_CHANNELS_PER_BLOCK = 4
EQUALIZER_BAND_COUNT = len(EQUALIZER_BAND_CENTRES_HZ)

# A crossover slot that is set to Pass passes the signal through untouched.
IDENTITY_SECTION = (1.0, 0.0, 0.0, 0.0, 0.0)

# The cutoff list the app offers. The enum carries 22 names, but the library
# folds them onto these 11 positions; the speaker's role decides whether a
# position means this frequency or fifty times it.
CROSSOVER_CUTOFFS_HZ = (
    25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250,
)
CROSSOVER_HIGH_RANGE_FACTOR = 50

# A crossover payload is several blocks, concatenated in config-id order.
# Each block is a run of biquads; one block also carries a spare word.
CROSSOVER_BLOCK_BIQUADS = {3: 6, 4: 3, 5: 12}
CROSSOVER_BLOCK_SPARE_WORDS = {4: 1}

# Which blocks each speaker layout sends.
CROSSOVER_LAYOUT_BLOCKS = {
    "standard": (3, 4),
    "standard_rear": (3, 4),
    "network": (3, 4, 5),
}

# Which block and biquad each filter slot writes into. A slot owns that
# biquad and the next one: a shallow slope uses the first, a steeper one
# brings in the second. Slots absent from a layout are never written.
CROSSOVER_SLOT_POSITIONS = {
    "standard": {0: (3, 2), 1: (3, 4), 4: (4, 0)},
    "standard_rear": {0: (3, 2), 4: (4, 0)},
    "network": {0: (3, 2), 1: (3, 4), 2: (5, 6), 3: (5, 9), 4: (4, 0)},
}

CROSSOVER_SLOT_COUNT = 5

# Distances travel as millimetres and come back as sample delays. The library
# takes the speed of sound as exactly 340 m/s.
SPEED_OF_SOUND_MM_PER_SECOND = 340_000
TIME_ALIGNMENT_SLOT_COUNT = 5
TIME_ALIGNMENT_BLOCK_WORDS = 8

# The screen stops at 350 cm between the nearest and the farthest speaker, so
# the library never writes a longer delay than that distance earns. It clamps
# the delay itself, not the distance: two layouts with the same spread give
# the same delays however far away both speakers are.
TIME_ALIGNMENT_MAX_DELAY_SAMPLES = 453


# The library does not design each equalizer band straight from its slider.
# It first spreads every band's gain over its neighbours, then designs the
# biquads from the spread gains. `fit_equalizer_gains` below does that step.
# The three tables come from the library's own constant pool; the comments
# say what each one controls.

# How hard a band pushes, by its gain rounded up to whole dB. A band at
# 1 dB or less pushes nothing, so the table starts at 2 dB.
# Several entries are not the decimal they look like. They are the exact
# doubles the library holds, and the equalizer truncates towards zero, so a
# rounded constant here changes real bytes. Do not tidy them.
EQUALIZER_PUSH_WEIGHTS = (
    0.05,
    0.065,
    0.08,
    0.095,
    0.11,
    0.125,
    0.14,
    0.155,
    0.17,
    0.185,
    0.19999999999999998,
    0.215,
    0.23,
    0.245,
    0.26,
    0.275,
    0.29000000000000004,
    0.30500000000000005,
    0.31999999999999995,
    0.33499999999999996,
    0.35,
    0.365,
    0.38,
    0.395,
)

# How the push falls off with the distance between two bands, in band steps.
EQUALIZER_PUSH_DECAY = (
    1.0,
    0.47619047619047616,
    0.22675736961451246,
    0.1079796998164345,
    0.051418904674492616,
    0.02448519270213934,
    0.011659615572447303,
    0.005552197891641572,
    0.002643903757924558,
    0.0012590017894878848,
    0.0005995246616608976,
    0.0002854879341242369,
)

# How strongly each band reacts. The outer bands move more than the middle.
EQUALIZER_BAND_REACTION = (
    1.9, 1.3, 1.12, 1.05, 1.02,
    1.0, 1.0, 1.0, 1.02, 1.05,
    1.12, 1.3, 1.9,
)

# A band loses this share of its neighbour's push and keeps this share of
# its own.
EQUALIZER_PUSH_SHARE = 0.3
EQUALIZER_KEEP_SHARE = 0.03

# The sliders stop at 12 dB, and spreading the gains can carry a band past
# that. The library clamps before it designs, so this module clamps too.
EQUALIZER_GAIN_LIMIT_DB = 12.0


class FilterKind(str, Enum):
    HIGH_PASS = "high_pass"
    LOW_PASS = "low_pass"


class FilterSlope(int, Enum):
    """Crossover steepness in dB per octave; the value is the filter order."""

    PASS = 0
    SLOPE_6 = 1
    SLOPE_12 = 2
    SLOPE_18 = 3
    SLOPE_24 = 4


# The Q of each second-order section of a Butterworth of this order, in the
# order the library writes them. `None` marks a first-order section. Orders 5
# and 6 exist in the app's enum but crash the library, so they are absent here.
BUTTERWORTH_SECTION_QS: dict[FilterSlope, tuple[float | None, ...]] = {
    FilterSlope.SLOPE_6: (None,),
    FilterSlope.SLOPE_12: (0.7071067811865476,),
    FilterSlope.SLOPE_18: (1.0, None),
    FilterSlope.SLOPE_24: (1.3065629648763764, 0.5411961001461969),
}

# A biquad as the unit stores it: numerator, then the negated denominator.
Biquad = tuple[float, float, float, float, float]


@dataclass(frozen=True)
class CrossoverSetting:
    """One speaker's crossover, as the filter screen presents it."""

    kind: FilterKind
    cutoff_hz: float
    slope: FilterSlope


def equalizer_band_push(gain_db: float) -> float:
    """Returns how hard one band pushes the other bands.

    The library picks the weight by the gain rounded up to whole dB. A band at
    one dB or less pushes nothing.
    """
    weight_index = min(math.ceil(abs(gain_db)), len(EQUALIZER_PUSH_WEIGHTS)) - 2
    if weight_index < 0:
        return 0.0
    return EQUALIZER_PUSH_WEIGHTS[weight_index] * gain_db


def fit_equalizer_gains(band_gains_db: list[float]) -> list[float]:
    """Returns the gains the library designs its biquads from.

    A band that shares its sign with another band pulls that band towards
    zero. Two bands of opposite sign do not interact at all, so a band left
    at zero stays at zero. Spreading can push a band past the slider range,
    so the result is clamped to the range the sliders allow.
    """
    # The order of these multiplies and adds follows the library's own, step
    # for step. Collecting the terms algebraically gives the same number in
    # real arithmetic but a different last bit in float64, and the equalizer
    # truncates, so a last bit can change a stored coefficient.
    fitted_gains_db = list(band_gains_db)
    for source in range(len(band_gains_db)):
        if band_gains_db[source] == 0:
            continue
        for target in range(len(band_gains_db)):
            if target == source or band_gains_db[target] == 0:
                continue
            if (band_gains_db[source] > 0) != (band_gains_db[target] > 0):
                continue
            spread = equalizer_band_push(band_gains_db[source])
            spread *= EQUALIZER_PUSH_DECAY[abs(source - target) - 1]
            spread *= EQUALIZER_BAND_REACTION[target]
            fitted_gains_db[target] -= EQUALIZER_PUSH_SHARE * spread
            fitted_gains_db[source] += EQUALIZER_KEEP_SHARE * spread
    return [
        max(-EQUALIZER_GAIN_LIMIT_DB, min(EQUALIZER_GAIN_LIMIT_DB, gain_db))
        for gain_db in fitted_gains_db
    ]


def design_equalizer_band(centre_hz: float, gain_db: float) -> Biquad:
    """Returns one equalizer section.

    The filter is an asymmetric constant-Q peaker. A boost widens the
    numerator and leaves the denominator alone; a cut widens the denominator
    and leaves the numerator alone. At 0 dB both branches give a section whose
    numerator mirrors its denominator, so it passes the signal unchanged while
    keeping its centre and Q.
    """
    angular_frequency = 2 * math.pi * centre_hz / EQUALIZER_SAMPLE_RATE
    alpha = math.sin(angular_frequency) / (2 * EQUALIZER_Q)
    amplitude = 10 ** (gain_db / 20)

    if amplitude >= 1:
        numerator_alpha = alpha * amplitude
        denominator_alpha = alpha
    else:
        numerator_alpha = alpha
        denominator_alpha = alpha / amplitude

    scale = 1 + denominator_alpha
    feedback_first = -2 * math.cos(angular_frequency) / scale
    return (
        (1 + numerator_alpha) / scale,
        feedback_first,
        (1 - numerator_alpha) / scale,
        -feedback_first,
        -(1 - denominator_alpha) / scale,
    )


def build_equalizer_block(band_gains_db: list[float]) -> list[Biquad]:
    """Returns one 52-section equalizer block: four channels of 13 bands.

    The app writes the same curve into all four channels. Which physical
    output each channel drives is not known and does not change the bytes.
    """
    if len(band_gains_db) != EQUALIZER_BAND_COUNT:
        raise ValueError(
            f"expected {EQUALIZER_BAND_COUNT} band gains, got {len(band_gains_db)}"
        )
    fitted_gains_db = fit_equalizer_gains(band_gains_db)
    one_channel = [
        design_equalizer_band(centre_hz, gain_db)
        for centre_hz, gain_db in zip(EQUALIZER_BAND_CENTRES_HZ, fitted_gains_db)
    ]
    return one_channel * EQUALIZER_CHANNELS_PER_BLOCK


def build_equalizer_payload(
    cancelled_band_gains_db: list[float],
    plain_band_gains_db: list[float],
) -> bytes:
    """Returns the body of command 0x05 CONFIG_ID 13.

    The unit wants two blocks: the curve with the cancelling equalizer applied,
    then the same curve without it.
    """
    sections = (
        build_equalizer_block(cancelled_band_gains_db)
        + build_equalizer_block(plain_band_gains_db)
    )
    return encode_sections(sections, Rounding.TRUNCATE)


def _design_first_order(kind: FilterKind, cutoff_hz: float) -> Biquad:
    warped = math.tan(math.pi * cutoff_hz / CROSSOVER_SAMPLE_RATE)
    pole = (1 - warped) / (1 + warped)
    if kind is FilterKind.HIGH_PASS:
        gain = 1 / (1 + warped)
        return (gain, -gain, 0.0, pole, 0.0)
    gain = warped / (1 + warped)
    return (gain, gain, 0.0, pole, 0.0)


def _design_second_order(kind: FilterKind, cutoff_hz: float, quality: float) -> Biquad:
    angular_frequency = 2 * math.pi * cutoff_hz / CROSSOVER_SAMPLE_RATE
    cosine = math.cos(angular_frequency)
    alpha = math.sin(angular_frequency) / (2 * quality)
    scale = 1 + alpha
    feedback_first = -2 * cosine / scale
    feedback_second = (1 - alpha) / scale
    if kind is FilterKind.HIGH_PASS:
        forward_outer = (1 + cosine) / 2 / scale
        forward_middle = -(1 + cosine) / scale
    else:
        forward_outer = (1 - cosine) / 2 / scale
        forward_middle = (1 - cosine) / scale
    return (
        forward_outer,
        forward_middle,
        forward_outer,
        -feedback_first,
        -feedback_second,
    )


def design_crossover(setting: CrossoverSetting) -> tuple[Biquad, Biquad]:
    """Returns the two sections one speaker's crossover occupies.

    The slope is the Butterworth order. An order that needs only one section
    leaves the second one as a pass-through.
    """
    if setting.slope is FilterSlope.PASS:
        return (IDENTITY_SECTION, IDENTITY_SECTION)

    sections = [
        _design_first_order(setting.kind, setting.cutoff_hz)
        if quality is None
        else _design_second_order(setting.kind, setting.cutoff_hz, quality)
        for quality in BUTTERWORTH_SECTION_QS[setting.slope]
    ]
    while len(sections) < 2:
        sections.append(IDENTITY_SECTION)
    return (sections[0], sections[1])


def build_crossover_payload(
    layout: str, settings: list[CrossoverSetting | None]
) -> bytes:
    """Returns the body of the crossover command for one speaker layout.

    `settings` holds one entry per filter slot, or None for a slot the layout
    does not use. A slot set to Pass leaves its two biquads as identity.
    """
    if layout not in CROSSOVER_LAYOUT_BLOCKS:
        raise ValueError(f"unknown speaker layout {layout!r}")
    if len(settings) != CROSSOVER_SLOT_COUNT:
        raise ValueError(
            f"expected {CROSSOVER_SLOT_COUNT} slots, got {len(settings)}"
        )

    blocks = {
        block_id: [list(IDENTITY_SECTION) for _ in range(CROSSOVER_BLOCK_BIQUADS[block_id])]
        for block_id in CROSSOVER_LAYOUT_BLOCKS[layout]
    }
    positions = CROSSOVER_SLOT_POSITIONS[layout]
    for slot, setting in enumerate(settings):
        if setting is None:
            continue
        if slot not in positions:
            raise ValueError(f"layout {layout!r} has no slot {slot}")
        block_id, first_biquad = positions[slot]
        first, second = design_crossover(setting)
        blocks[block_id][first_biquad] = list(first)
        blocks[block_id][first_biquad + 1] = list(second)

    payload = bytearray()
    for block_id in CROSSOVER_LAYOUT_BLOCKS[layout]:
        payload += encode_sections(
            [tuple(section) for section in blocks[block_id]], Rounding.NEAREST
        )
        payload += bytes(4 * CROSSOVER_BLOCK_SPARE_WORDS.get(block_id, 0))
    return bytes(payload)


def time_alignment_delays(distances_mm: list[int]) -> list[int]:
    """Returns one delay in samples per speaker.

    The farthest speaker gets no delay; every nearer speaker waits for it. The
    library subtracts the distances first and scales afterwards, and truncates
    rather than rounds. It also stops at the delay the screen's longest
    distance earns, so a wider spread than that adds nothing.
    """
    if len(distances_mm) != TIME_ALIGNMENT_SLOT_COUNT:
        raise ValueError(
            f"expected {TIME_ALIGNMENT_SLOT_COUNT} distances, got {len(distances_mm)}"
        )
    farthest = max(distances_mm)
    return [
        min(
            (farthest - distance_mm) * EQUALIZER_SAMPLE_RATE
            // SPEED_OF_SOUND_MM_PER_SECOND,
            TIME_ALIGNMENT_MAX_DELAY_SAMPLES,
        )
        for distance_mm in distances_mm
    ]


def build_time_alignment_payload(distances_mm: list[int]) -> bytes:
    """Returns the 16-byte time-alignment block: eight uint16, five of them used."""
    words = time_alignment_delays(distances_mm)
    words += [0] * (TIME_ALIGNMENT_BLOCK_WORDS - len(words))
    return b"".join(word.to_bytes(2, "little") for word in words)


class Rounding(str, Enum):
    """How a coefficient reaches its stored integer.

    The library does not pick one rule. Its equalizer builder truncates
    towards zero and its crossover builder rounds to nearest, and the two
    disagree on about two coefficients in five. Each builder below passes the
    rule its own payload needs; getting it wrong changes the bytes.
    """

    TRUNCATE = "truncate"
    NEAREST = "nearest"


def to_q27(value: float, rounding: Rounding = Rounding.NEAREST) -> int:
    """Returns one coefficient as the unit stores it."""
    if rounding is Rounding.TRUNCATE:
        return int(value * Q27_UNITY)
    return round(value * Q27_UNITY)


def encode_sections(
    sections: list[Biquad], rounding: Rounding = Rounding.NEAREST
) -> bytes:
    """Returns biquad sections as little-endian Q27, five words per section."""
    return b"".join(
        to_q27(coefficient, rounding).to_bytes(4, "little", signed=True)
        for section in sections
        for coefficient in section
    )


def decode_sections(payload: bytes) -> list[Biquad]:
    """Returns the biquad sections a coefficient payload carries."""
    if len(payload) % 20:
        raise ValueError(f"payload of {len(payload)} bytes is not whole sections")
    words = [
        int.from_bytes(payload[offset:offset + 4], "little", signed=True) / Q27_UNITY
        for offset in range(0, len(payload), 4)
    ]
    return [tuple(words[start:start + 5]) for start in range(0, len(words), 5)]

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

# Distances travel as millimetres and come back as sample delays. The library
# takes the speed of sound as exactly 340 m/s.
SPEED_OF_SOUND_MM_PER_SECOND = 340_000
TIME_ALIGNMENT_SLOT_COUNT = 5
TIME_ALIGNMENT_BLOCK_WORDS = 8


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
    one_channel = [
        design_equalizer_band(centre_hz, gain_db)
        for centre_hz, gain_db in zip(EQUALIZER_BAND_CENTRES_HZ, band_gains_db)
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
    return encode_sections(sections)


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


def time_alignment_delays(distances_mm: list[int]) -> list[int]:
    """Returns one delay in samples per speaker.

    The farthest speaker gets no delay; every nearer speaker waits for it. The
    library subtracts the distances first and scales afterwards, and truncates
    rather than rounds.
    """
    if len(distances_mm) != TIME_ALIGNMENT_SLOT_COUNT:
        raise ValueError(
            f"expected {TIME_ALIGNMENT_SLOT_COUNT} distances, got {len(distances_mm)}"
        )
    farthest = max(distances_mm)
    return [
        (farthest - distance_mm) * EQUALIZER_SAMPLE_RATE
        // SPEED_OF_SOUND_MM_PER_SECOND
        for distance_mm in distances_mm
    ]


def build_time_alignment_payload(distances_mm: list[int]) -> bytes:
    """Returns the 16-byte time-alignment block: eight uint16, five of them used."""
    words = time_alignment_delays(distances_mm)
    words += [0] * (TIME_ALIGNMENT_BLOCK_WORDS - len(words))
    return b"".join(word.to_bytes(2, "little") for word in words)


def to_q27(value: float) -> int:
    """Returns one coefficient as the unit stores it."""
    return round(value * Q27_UNITY)


def encode_sections(sections: list[Biquad]) -> bytes:
    """Returns biquad sections as little-endian Q27, five words per section."""
    return b"".join(
        to_q27(coefficient).to_bytes(4, "little", signed=True)
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

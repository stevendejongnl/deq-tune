"""Runs the shared conformance corpus against the Python implementation.

`conformance/flows.json` holds every flow the DEQ needs, with the exact
bytes the Pioneer Sound & Tune app produces for it. Those bytes come from
the app's own code on a running device, so the app is the oracle and this
code is the thing under test. `frontend/src/deq/conformance.test.ts` runs the
same corpus against the TypeScript implementation, which is the one that
actually talks to the unit over WebUSB.

Both runners check both directions wherever a flow can be read back, so a
drift in either direction fails.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.deq_blob import decode_blob, encode_blob
from app.deq_dsp import (
    CrossoverSetting,
    FilterKind,
    FilterSlope,
    build_crossover_payload,
    build_equalizer_payload,
    build_time_alignment_payload,
)
from app.deq_protocol import Direction, Message, decode_frame, encode_frame

CORPUS_PATH = Path(__file__).resolve().parents[2] / "conformance" / "flows.json"
CORPUS = json.loads(CORPUS_PATH.read_text())
FLOWS = CORPUS["flows"]

# The maker the app calls, and the speaker layout this code calls it.
MAKER_LAYOUTS = {
    "MakeSpeakerFilterStandardMode": "standard",
    "MakeSpeakerFilterStandardRearMode": "standard_rear",
    "MakeSpeakerFilterNetworkMode": "network",
}

# The 11 cutoff positions, under both the names the app's enum gives them.
# A position means the low frequency or fifty times it, decided by the
# speaker's role, so the name alone does not fix the frequency.
CUTOFF_POSITIONS = {
    "FREQUENCY_25HZ": 0, "FREQUENCY_31_5HZ": 1, "FREQUENCY_40HZ": 2,
    "FREQUENCY_50HZ": 3, "FREQUENCY_63HZ": 4, "FREQUENCY_80HZ": 5,
    "FREQUENCY_100HZ": 6, "FREQUENCY_125HZ": 7, "FREQUENCY_160HZ": 8,
    "FREQUENCY_200HZ": 9, "FREQUENCY_250HZ": 10,
    "FREQUENCY_1_25KHZ": 0, "FREQUENCY_1_6KHZ": 1, "FREQUENCY_2KHZ": 2,
    "FREQUENCY_2_5KHZ": 3, "FREQUENCY_3_15KHZ": 4, "FREQUENCY_4KHZ": 5,
    "FREQUENCY_5kHZ": 6, "FREQUENCY_6_3KHZ": 7, "FREQUENCY_8KHZ": 8,
    "FREQUENCY_10KHZ": 9, "FREQUENCY_12_5KHZ": 10,
}
CUTOFF_HZ = (25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250)
HIGH_RANGE_FACTOR = 50

SLOPES = {
    "SLOPE_PASS": FilterSlope.PASS,
    "SLOPE_6DB": FilterSlope.SLOPE_6,
    "SLOPE_12DB": FilterSlope.SLOPE_12,
    "SLOPE_18DB": FilterSlope.SLOPE_18,
    "SLOPE_24DB": FilterSlope.SLOPE_24,
}

# Which side of the crossover each slot is, and which decade its cutoff code
# means, per layout. Both were read back out of the library's own output.
SLOT_ROLES = {
    "standard": {
        0: (FilterKind.HIGH_PASS, False),
        1: (FilterKind.HIGH_PASS, False),
        4: (FilterKind.LOW_PASS, False),
    },
    "standard_rear": {
        0: (FilterKind.HIGH_PASS, False),
        4: (FilterKind.LOW_PASS, False),
    },
    "network": {
        0: (FilterKind.HIGH_PASS, True),
        1: (FilterKind.HIGH_PASS, False),
        2: (FilterKind.LOW_PASS, True),
        3: (FilterKind.LOW_PASS, True),
        4: (FilterKind.LOW_PASS, False),
    },
}


def flows_of(kind: str) -> list[dict]:
    return [flow for flow in FLOWS if flow["kind"] == kind]


def flow_id(flow: dict) -> str:
    return flow["name"]


def test_the_corpus_covers_every_flow_kind() -> None:
    kinds = {flow["kind"] for flow in FLOWS}
    assert kinds == {"frame", "equalizer", "crossover", "timeAlignment", "blob"}


def test_every_flow_has_a_named_oracle() -> None:
    for flow in FLOWS:
        assert flow["oracle"] in {"android-library", "android-codec", "device-capture"}


@pytest.mark.parametrize("flow", flows_of("frame"), ids=flow_id)
def test_a_frame_flow_writes_the_bytes_the_app_wrote(flow: dict) -> None:
    message = Message(
        direction=Direction(flow["input"]["direction"]),
        command_id=flow["input"]["commandId"],
        transaction_id=bytes.fromhex(flow["input"]["transactionIdHex"]),
        body=bytes.fromhex(flow["input"]["bodyHex"]),
    )
    assert encode_frame(message).hex() == flow["bytesHex"]


@pytest.mark.parametrize("flow", flows_of("frame"), ids=flow_id)
def test_a_frame_flow_reads_back_to_its_own_input(flow: dict) -> None:
    message = decode_frame(bytes.fromhex(flow["bytesHex"]))
    assert int(message.direction) == flow["input"]["direction"]
    assert message.command_id == flow["input"]["commandId"]
    assert message.transaction_id.hex() == flow["input"]["transactionIdHex"]
    assert message.body.hex() == flow["input"]["bodyHex"]


@pytest.mark.parametrize("flow", flows_of("equalizer"), ids=flow_id)
def test_an_equalizer_flow_writes_the_bytes_the_app_wrote(flow: dict) -> None:
    payload = build_equalizer_payload(
        flow["input"]["cancelledGainsDb"], flow["input"]["plainGainsDb"]
    )
    assert payload.hex() == flow["bytesHex"]


@pytest.mark.parametrize("flow", flows_of("crossover"), ids=flow_id)
def test_a_crossover_flow_writes_the_bytes_the_app_wrote(flow: dict) -> None:
    layout = MAKER_LAYOUTS[flow["input"]["maker"]]
    settings: list[CrossoverSetting | None] = []
    for slot, raw in enumerate(flow["input"]["slots"]):
        role = SLOT_ROLES[layout].get(slot)
        slope = SLOPES[raw["slope"]]
        if role is None or slope is FilterSlope.PASS:
            settings.append(None)
            continue
        kind, uses_high_range = role
        cutoff_hz = CUTOFF_HZ[CUTOFF_POSITIONS[raw["cutoff"]]]
        if uses_high_range:
            cutoff_hz *= HIGH_RANGE_FACTOR
        settings.append(CrossoverSetting(kind=kind, cutoff_hz=cutoff_hz, slope=slope))
    assert build_crossover_payload(layout, settings).hex() == flow["bytesHex"]


@pytest.mark.parametrize("flow", flows_of("timeAlignment"), ids=flow_id)
def test_a_time_alignment_flow_writes_the_bytes_the_app_wrote(flow: dict) -> None:
    payload = build_time_alignment_payload(flow["input"]["distancesMm"])
    assert payload.hex() == flow["bytesHex"]


@pytest.mark.parametrize("flow", flows_of("blob"), ids=flow_id)
def test_a_blob_flow_reads_and_writes_what_the_app_does(flow: dict) -> None:
    # The app read the input bytes and wrote these out. This code must agree
    # on both steps, so a round trip here is the same check the app passed.
    blob = bytes.fromhex(flow["input"]["bytesHex"])
    assert encode_blob(decode_blob(blob)).hex() == flow["bytesHex"]

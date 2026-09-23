"""Pydantic models for the DEQ tuning-data blob.

Mirrors the shape found in the Pioneer Sound Tune app's bundled preset
JSON files (see data/presets/mazda/*.json) as closely as possible, so
factory presets round-trip without reshaping and a future USB bridge
can write the same structure back to a device.

Note the real structure nests `expandEq` *inside* `foundationEq`
(confirmed across all 14 bundled presets) — it is not a sibling field.
"""

from __future__ import annotations

from pydantic import BaseModel


class Header(BaseModel):
    formatVersion: str
    dataVersion: str
    uniqueId: str
    supportedProcessors: list[str]
    lengthUnit: int
    speakerProductType: int
    brandName: str
    carModel: str
    startYear: int
    endYear: int
    bankName: str
    handlePosition: int
    listeningPosition: int
    layoutMode: int
    brandNameStringsKey: str
    carModelStringsKey: str


class LRBank(BaseModel):
    """A combined L+R graphic-EQ slot. `banks` holds one 13-value gain
    array per storable bank (device has multiple slots); `selectedBank`
    picks which one is active. Frequencies follow the fixed 13-band
    table also given explicitly per-channel in `expandEq` (50Hz-12.5kHz,
    doubling)."""

    isLocked: bool
    numOfBand: int
    selectedBank: int
    banks: list[list[float]]


class ChannelBankData(BaseModel):
    q: list[float]
    f0: list[float]
    gain: list[float]


class ChannelBank(BaseModel):
    isLocked: bool
    numOfBand: int
    selectedBank: int
    banks: ChannelBankData


class FoundationEq(BaseModel):
    isLRMode: bool
    eqs: dict[str, LRBank]
    expandEq: dict[str, ChannelBank]


class Speaker(BaseModel):
    isPositivePhase: bool
    levelDB: float
    timeAlignmentCm: float
    levelDBExtended: float


class FilterBand(BaseModel):
    cutoff_hpf: float
    slope_hpf: float


class Filter(BaseModel):
    front: FilterBand
    rear: FilterBand


class CancellingEq(BaseModel):
    L: list[float]
    R: list[float]


class CancellingTA(BaseModel):
    L: float
    R: float


class FactoryCancelData(BaseModel):
    cancellingEQ: CancellingEq
    cancellingTACm: CancellingTA


class FactoryCancel(BaseModel):
    available: bool
    enabled: bool
    data: FactoryCancelData


class FaderBalance(BaseModel):
    fader: float
    balance: float


class TimeAlignment(BaseModel):
    enabled: bool
    easySoundFitModeEnabled: bool
    easySoundFitMode: int


class TuningData(BaseModel):
    """Everything except `header` — the part that's actually editable
    in the EQ UI and (eventually) written to the device."""

    foundationEq: FoundationEq
    speakers: dict[str, Speaker]
    filter: Filter
    factoryCancel: FactoryCancel
    faderBalance: FaderBalance
    timeAlignment: TimeAlignment

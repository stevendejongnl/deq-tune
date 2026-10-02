from __future__ import annotations

from pydantic import BaseModel

from app.deq_enums import EQ_STYLE, LIVE_SIMULATION
from app.eq_data import TuningData


class ProfileRead(BaseModel):
    id: int
    name: str
    source: str
    brand_name: str | None
    car_model: str | None
    speaker_type: str | None
    supported_processors: list[str]
    data: TuningData


class ProfileCreate(BaseModel):
    name: str
    data: TuningData
    brand_name: str | None = None
    car_model: str | None = None
    speaker_type: str | None = None
    supported_processors: list[str] = []


class ProfileUpdate(BaseModel):
    name: str | None = None
    data: TuningData | None = None


class DeviceRead(BaseModel):
    """What the header shows about the unit."""

    connected: bool
    firmware_version: str | None = None
    serial: str | None = None
    problem: str | None = None


class DeqEnumValueRead(BaseModel):
    """One value the unit accepts, as the Pioneer app declares it."""

    name: str
    wire_value: int


class DeviceOptionsRead(BaseModel):
    """Every value set the unit's own DSP offers.

    These come from the app, through `deq_enums.json`, so the frontend
    never has to keep a list of its own.
    """

    eq_styles: list[DeqEnumValueRead]
    live_simulations: list[DeqEnumValueRead]


class EqStyleWrite(BaseModel):
    """Which built-in EQ style to select on the unit."""

    name: str


class LiveSimulationWrite(BaseModel):
    """Which built-in live-simulation mode to select on the unit."""

    name: str


def device_options() -> DeviceOptionsRead:
    """Returns the unit's value sets, read from the app's own enums."""
    return DeviceOptionsRead(
        eq_styles=[
            DeqEnumValueRead(name=value.name, wire_value=value.wire_value)
            for value in EQ_STYLE
        ],
        live_simulations=[
            DeqEnumValueRead(name=value.name, wire_value=value.wire_value)
            for value in LIVE_SIMULATION
        ],
    )

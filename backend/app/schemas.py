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


class BridgeNoticeRead(BaseModel):
    """One fault the bridge has seen since it started."""

    key: str
    severity: str
    message: str
    first_seen_seconds: float
    last_seen_seconds: float
    count: int


class BridgeRead(BaseModel):
    """What the app shows about the machine holding the link.

    This is the bridge, not the DEQ. The two fail for different reasons
    and ask different things of a person: a DEQ that is off is normal,
    and a bridge that is browning out is a fault in the wiring.

    The undervoltage fields are `None` where the machine cannot tell. A
    laptop has no `vcgencmd`, and `False` would be a claim it cannot
    make.
    """

    undervoltage_now: bool | None = None
    undervoltage_since_boot: bool | None = None
    uptime_seconds: float | None = None
    notices: list[BridgeNoticeRead] = []


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
    """Returns the choices the unit offers, read from the app's own enums.

    These are the `selectable` values, not every value. `UNKNOWN` is what
    a decoder returns for a wire value it does not recognise, so offering
    it put a tile with no label in the picker, and choosing it would have
    written wire value 0.
    """
    return DeviceOptionsRead(
        eq_styles=[
            DeqEnumValueRead(name=value.name, wire_value=value.wire_value)
            for value in EQ_STYLE.selectable
        ],
        live_simulations=[
            DeqEnumValueRead(name=value.name, wire_value=value.wire_value)
            for value in LIVE_SIMULATION.selectable
        ],
    )

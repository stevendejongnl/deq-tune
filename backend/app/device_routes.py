"""The HTTP face of the DEQ unit.

The backend owns the USB link, so the frontend asks these endpoints what
the unit is and tells them what to send it. Each handler does one thing and
hands the work to `deq_device`.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session

from app.db import get_session
from app.deq_device import DeqDevice, DeviceUnavailable, device
from app.eq_data import TuningData
from app.models import Profile
from app.schemas import (
    DeviceOptionsRead,
    DeviceRead,
    EqStyleWrite,
    LiveSimulationWrite,
    device_options,
)

router = APIRouter(prefix="/device", tags=["device"])

# 503, not 500: the unit being unplugged is a normal state, not a bug.
DEVICE_UNAVAILABLE_STATUS = 503


def get_device() -> DeqDevice:
    """Returns the one device object. A test overrides this dependency."""
    return device


@router.get("", response_model=DeviceRead)
def read_device(unit: DeqDevice = Depends(get_device)) -> DeviceRead:
    """Returns what the header shows. This never opens a link itself."""
    return DeviceRead(**vars(unit.state()))


@router.post("/connect", response_model=DeviceRead)
def connect_device(unit: DeqDevice = Depends(get_device)) -> DeviceRead:
    """Opens the link and runs the unit's startup sequence.

    A failure is reported in the body, not as an error status: the frontend
    shows the reason in the header rather than treating it as a broken
    request.
    """
    return DeviceRead(**vars(unit.connect()))


@router.post("/disconnect", response_model=DeviceRead)
def disconnect_device(unit: DeqDevice = Depends(get_device)) -> DeviceRead:
    unit.disconnect()
    return DeviceRead(**vars(unit.state()))


@router.get("/options", response_model=DeviceOptionsRead)
def read_device_options() -> DeviceOptionsRead:
    """Returns the value sets the unit accepts, read from the Pioneer app."""
    return device_options()


@router.post("/tuning/{profile_id}", response_model=DeviceRead)
def write_tuning(
    profile_id: int,
    unit: DeqDevice = Depends(get_device),
    session: Session = Depends(get_session),
) -> DeviceRead:
    """Sends one stored profile's DSP settings to the unit."""
    profile = session.get(Profile, profile_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="profile not found")
    # The column stores the tuning as plain JSON, so validate it before
    # the DSP code reads it by attribute.
    tuning = TuningData.model_validate(profile.data)
    run_on_unit(lambda: unit.write_tuning(tuning))
    return DeviceRead(**vars(unit.state()))


@router.post("/eq-style", response_model=DeviceRead)
def select_eq_style(
    body: EqStyleWrite, unit: DeqDevice = Depends(get_device)
) -> DeviceRead:
    """Picks one of the unit's own EQ styles."""
    run_on_unit(lambda: unit.run(lambda session: session.select_eq_style(body.name)))
    return DeviceRead(**vars(unit.state()))


@router.post("/live-simulation", response_model=DeviceRead)
def select_live_simulation(
    body: LiveSimulationWrite, unit: DeqDevice = Depends(get_device)
) -> DeviceRead:
    """Picks one of the unit's own live-simulation modes."""
    run_on_unit(
        lambda: unit.run(lambda session: session.select_live_simulation(body.name))
    )
    return DeviceRead(**vars(unit.state()))


def run_on_unit(action) -> None:
    """Runs one action, turning an unreachable unit into a 503.

    A bad value name is the caller's mistake, so it answers 400 instead.
    """
    try:
        action()
    except DeviceUnavailable as caught_error:
        raise HTTPException(
            status_code=DEVICE_UNAVAILABLE_STATUS, detail=str(caught_error)
        ) from caught_error
    except KeyError as caught_error:
        raise HTTPException(status_code=400, detail=str(caught_error)) from caught_error

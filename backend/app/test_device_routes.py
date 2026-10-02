"""Checks the device endpoints against a DEQ that answers like the real one."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.deq_device import DeqDevice, format_firmware_version
from app.device_routes import get_device
from app.main import app
from app.testing.fake_deq import FAKE_SERIAL, FakeDeq


@pytest.fixture
def unit() -> DeqDevice:
    """A device whose transport is a fake unit, injected through the seam."""
    return DeqDevice(build_transport_function=FakeDeq)


@pytest.fixture(name="device_client")
def device_client_fixture(seeded_client: TestClient, unit: DeqDevice) -> TestClient:
    """The seeded client from `conftest`, with the fake unit injected too."""
    app.dependency_overrides[get_device] = lambda: unit
    yield seeded_client
    app.dependency_overrides.pop(get_device, None)


def test_the_unit_starts_disconnected(device_client: TestClient) -> None:
    body = device_client.get("/api/device").json()
    assert body["connected"] is False
    assert body["firmware_version"] is None


def test_connecting_reports_what_the_unit_says(device_client: TestClient) -> None:
    body = device_client.post("/api/device/connect").json()
    assert body["connected"] is True
    assert body["firmware_version"] == "2.02"
    assert body["serial"] == FAKE_SERIAL


def test_disconnecting_clears_the_state(device_client: TestClient) -> None:
    device_client.post("/api/device/connect")
    body = device_client.post("/api/device/disconnect").json()
    assert body["connected"] is False


def test_a_link_that_cannot_open_reports_the_reason(device_client: TestClient) -> None:
    """A unit that never answers is a normal state, so the reason comes back
    in the body rather than as a failed request."""
    app.dependency_overrides[get_device] = lambda: DeqDevice(
        build_transport_function=lambda: FakeDeq(answers=False)
    )
    body = device_client.post("/api/device/connect").json()
    assert body["connected"] is False
    assert "no reply" in body["problem"]


def test_the_options_come_from_the_pioneer_app(device_client: TestClient) -> None:
    body = device_client.get("/api/device/options").json()
    assert len(body["eq_styles"]) == 21
    assert len(body["live_simulations"]) == 8
    assert {"name": "SUPER_BASS", "wire_value": 3} in body["eq_styles"]
    assert {"name": "OPERA_HALL", "wire_value": 6} in body["live_simulations"]


def test_pushing_a_profile_sends_three_blocks(device_client: TestClient, unit: DeqDevice) -> None:
    device_client.post("/api/device/connect")
    profile_id = device_client.get("/api/profiles").json()[0]["id"]

    assert device_client.post(f"/api/device/tuning/{profile_id}").status_code == 200

    transport = unit.require_session().transport
    coefficient_writes = [one for one in transport.exchanges if one.request.command_id == 0x05]
    assert len(coefficient_writes) == 3


def test_pushing_a_profile_that_does_not_exist_is_a_404(device_client: TestClient) -> None:
    device_client.post("/api/device/connect")
    assert device_client.post("/api/device/tuning/999999").status_code == 404


def test_pushing_a_profile_with_no_unit_is_a_503(device_client: TestClient) -> None:
    """An unplugged unit is not a broken request, so it answers 503."""
    profile_id = device_client.get("/api/profiles").json()[0]["id"]
    assert device_client.post(f"/api/device/tuning/{profile_id}").status_code == 503


def test_selecting_an_eq_style_reaches_the_units_blob(
    device_client: TestClient, unit: DeqDevice
) -> None:
    """A style is a byte in the settings blob, not a command of its own."""
    device_client.post("/api/device/connect")
    assert device_client.post("/api/device/eq-style", json={"name": "SUPER_BASS"}).status_code == 200
    assert unit.require_session().transport.configuration.preset_index_a == 3


def test_selecting_a_live_simulation_reaches_the_units_blob(
    device_client: TestClient, unit: DeqDevice
) -> None:
    device_client.post("/api/device/connect")
    response = device_client.post("/api/device/live-simulation", json={"name": "OPERA_HALL"})
    assert response.status_code == 200
    assert unit.require_session().transport.configuration.sound_field == 6


def test_a_style_the_unit_does_not_have_is_a_400(device_client: TestClient) -> None:
    device_client.post("/api/device/connect")
    assert device_client.post("/api/device/eq-style", json={"name": "NOT_A_STYLE"}).status_code == 400


def test_the_firmware_version_reads_the_way_the_app_shows_it() -> None:
    """The captured accessory string says `2.02`, from the bytes `0x0202`."""
    assert format_firmware_version(0x0202) == "2.02"
    assert format_firmware_version(0x0310) == "3.16"

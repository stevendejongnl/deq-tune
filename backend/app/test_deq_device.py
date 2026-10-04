"""Checks transport selection, the one part of deq_device.py that does not
need a running device to test: which transport a name picks, and what an
unknown or incomplete one reports.
"""

from __future__ import annotations

import pytest

from app.deq_device import (
    ESP_BRIDGE_PORT_ENVIRONMENT_VARIABLE,
    ESP_BRIDGE_TRANSPORT_NAME,
    FAKE_TRANSPORT_NAME,
    USB_TRANSPORT_NAME,
    DeviceUnavailable,
    build_transport,
)
from app.esp_bridge_transport import EspBridgeUnavailable
from app.testing.fake_deq import FakeDeq
from app.usb_transport import UsbUnavailable


def test_fake_is_the_default():
    assert isinstance(build_transport(), FakeDeq)


def test_fake_can_be_named_explicitly():
    assert isinstance(build_transport(FAKE_TRANSPORT_NAME), FakeDeq)


def test_an_unknown_name_is_an_error():
    with pytest.raises(DeviceUnavailable, match="no transport named"):
        build_transport("not-a-real-transport")


def test_esp_bridge_without_a_port_set_is_an_error():
    """The port has no sensible default -- it is a serial device path
    that differs by machine -- so asking for this transport without one
    fails loudly rather than guessing."""
    with pytest.raises(DeviceUnavailable, match=ESP_BRIDGE_PORT_ENVIRONMENT_VARIABLE):
        build_transport(ESP_BRIDGE_TRANSPORT_NAME)


def test_esp_bridge_with_no_pyserial_installed_says_so(monkeypatch):
    """`esp-bridge` is an optional extra; CI never installs it, so this is
    the path CI actually exercises."""
    try:
        import serial  # noqa: F401

        pytest.skip("pyserial is installed in this environment")
    except ModuleNotFoundError:
        pass
    monkeypatch.setenv(ESP_BRIDGE_PORT_ENVIRONMENT_VARIABLE, "/dev/ttyACM0")
    with pytest.raises(EspBridgeUnavailable, match="pyserial is not installed"):
        build_transport(ESP_BRIDGE_TRANSPORT_NAME)


def test_esp_bridge_with_a_port_set_tries_to_open_it(monkeypatch):
    """No real board is on this machine, so this only checks that a port
    name is actually used, not that the link succeeds. Opening the port
    is `EspBridgeTransport`'s own job, so its failure comes back as the
    transport's own error, not wrapped in `DeviceUnavailable` --
    `DeqDevice.connect()` is what catches `TransportError` and turns it
    into a reported problem; `build_transport` itself does not."""
    try:
        import serial  # noqa: F401
    except ModuleNotFoundError:
        pytest.skip("pyserial is not installed in this environment")
    monkeypatch.setenv(ESP_BRIDGE_PORT_ENVIRONMENT_VARIABLE, "/dev/does-not-exist")
    with pytest.raises(EspBridgeUnavailable, match="/dev/does-not-exist"):
        build_transport(ESP_BRIDGE_TRANSPORT_NAME)


def test_usb_with_no_pyusb_installed_says_so():
    """`usb` is an optional extra; CI never installs it, so this is the
    path CI actually exercises. Same story as the ESP bridge case above:
    `UsbUnavailable` is the transport's own error, not `DeviceUnavailable`."""
    try:
        import usb.core  # noqa: F401

        pytest.skip("pyusb is installed in this environment")
    except ModuleNotFoundError:
        pass
    with pytest.raises(UsbUnavailable, match="pyusb is not installed"):
        build_transport(USB_TRANSPORT_NAME)

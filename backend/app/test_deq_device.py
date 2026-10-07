"""Checks transport selection, the one part of deq_device.py that does not
need a running device to test: which transport a name picks, and what an
unknown or incomplete one reports.
"""

from __future__ import annotations

import time

import pytest

from app.deq_device import (
    ESP_BRIDGE_PORT_ENVIRONMENT_VARIABLE,
    ESP_BRIDGE_TRANSPORT_NAME,
    FAKE_TRANSPORT_NAME,
    USB_TRANSPORT_NAME,
    DeqDevice,
    DeviceState,
    DeviceUnavailable,
    LinkKeeper,
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


class RecordingWait:
    """Answers the keeper's waits, and stops it after a set number.

    It counts the waits and returns False on the last one; `LinkKeeper`
    calls it in place of sleeping; it depends on nothing. Without this a
    test of a retry loop would have to sleep in real time.
    """

    def __init__(self, allowed_waits: int) -> None:
        self.allowed_waits = allowed_waits
        self.waited_seconds: list[float] = []

    def __call__(self, seconds: float) -> bool:
        self.waited_seconds.append(seconds)
        return len(self.waited_seconds) < self.allowed_waits


class CountingDevice:
    """A device that records connect calls and reports a chosen state.

    It stands in for `DeqDevice`; `LinkKeeper` drives it; it depends on
    nothing. `connect_results` gives one state per call, so a test can say
    "fail, fail, then succeed".
    """

    def __init__(self, connect_results: list[DeviceState]) -> None:
        self.connect_results = list(connect_results)
        self.connect_count = 0
        self._state = DeviceState(connected=False)

    def connect(self) -> DeviceState:
        self.connect_count += 1
        if self.connect_results:
            self._state = self.connect_results.pop(0)
        return self._state

    def state(self) -> DeviceState:
        return self._state

    def drop_link(self, problem: str) -> None:
        """Leaves the state a failed action leaves behind."""
        self._state = DeviceState(connected=False, problem=problem)


class RaisingDevice:
    """A device whose connect raises instead of reporting a problem.

    `DeqDevice.connect` turns the errors it expects into a state, but a
    transport can raise something else. The keeper must survive that, or
    the thread dies and nothing reconnects.
    """

    def __init__(self) -> None:
        self.connect_count = 0

    def connect(self) -> DeviceState:
        self.connect_count += 1
        raise RuntimeError("the bridge is not there")

    def state(self) -> DeviceState:
        return DeviceState(connected=False)


def test_the_keeper_connects_without_being_asked():
    """The whole point: no user action starts the link."""
    unit = CountingDevice([DeviceState(connected=True)])
    wait = RecordingWait(allowed_waits=1)

    LinkKeeper(unit, wait_function=wait).run()

    assert unit.connect_count == 1
    assert unit.state().connected is True


def test_the_keeper_stops_trying_once_the_link_is_up():
    """A connected unit must not be reconnected. Opening a second session
    on a live link would leave two writers on one transport."""
    unit = CountingDevice([DeviceState(connected=True)])
    wait = RecordingWait(allowed_waits=4)

    LinkKeeper(unit, wait_function=wait).run()

    assert unit.connect_count == 1


def test_the_keeper_tries_again_after_a_failure():
    """The car is off, then it is on. Nobody presses anything between."""
    unit = CountingDevice(
        [
            DeviceState(connected=False, problem="the unit is not connected"),
            DeviceState(connected=False, problem="the unit is not connected"),
            DeviceState(connected=True),
        ]
    )
    wait = RecordingWait(allowed_waits=5)

    LinkKeeper(unit, wait_function=wait).run()

    assert unit.connect_count == 3
    assert unit.state().connected is True


def test_the_keeper_reconnects_when_a_live_link_drops():
    """`DeqDevice.run` drops the link when a session fails, so the keeper
    has to notice and open a new one."""
    unit = CountingDevice([DeviceState(connected=True)])
    wait = RecordingWait(allowed_waits=4)
    keeper = LinkKeeper(unit, wait_function=wait)

    keeper.connect_once()
    assert unit.connect_count == 1

    unit.drop_link("the link failed")

    keeper.run()

    assert unit.connect_count > 1


def test_a_raising_connect_does_not_stop_the_keeper():
    unit = RaisingDevice()
    wait = RecordingWait(allowed_waits=3)

    LinkKeeper(unit, wait_function=wait).run()

    assert unit.connect_count == 3


def test_a_raising_connect_is_reported_as_a_problem():
    state = LinkKeeper(RaisingDevice()).connect_once()

    assert state.connected is False
    assert "the bridge is not there" in state.problem


def test_the_keeper_waits_the_interval_it_was_given():
    unit = CountingDevice([DeviceState(connected=True)])
    wait = RecordingWait(allowed_waits=3)

    LinkKeeper(unit, retry_seconds=1.5, wait_function=wait).run()

    assert wait.waited_seconds == [1.5, 1.5, 1.5]


def test_the_keeper_connects_a_real_device_to_the_fake_unit():
    """End to end against `FakeDeq`, so the loop is proved against the
    real `DeqDevice` and not only against a stand-in."""
    unit = DeqDevice(build_transport_function=FakeDeq)
    wait = RecordingWait(allowed_waits=1)

    LinkKeeper(unit, wait_function=wait).run()

    state = unit.state()
    assert state.connected is True
    assert state.firmware_version is not None


def test_start_and_stop_run_the_loop_in_a_thread():
    """`start` must actually connect, and `stop` must end the thread."""
    unit = DeqDevice(build_transport_function=FakeDeq)
    keeper = LinkKeeper(unit, retry_seconds=0.01)

    keeper.start()
    try:
        deadline = time.monotonic() + 5.0
        while time.monotonic() < deadline and not unit.state().connected:
            time.sleep(0.01)
        assert unit.state().connected is True
    finally:
        keeper.stop()

    assert keeper.is_running() is False

"""Holds the one link to the DEQ unit.

The backend owns the link, not the browser. The process that holds the
handle is this one, so the frontend reads device state over HTTP like any
other data.

Which transport that link uses is configuration. `DEQ_TRANSPORT=simulator`
serves a simulated unit a developer can change while it runs, through
`tools/deq_console.py` -- see `deq_simulator_transport.py`.
`DEQ_TRANSPORT=fake` is
the default, which talks to `testing/fake_deq.py` so the whole app runs end
to end with no hardware. `DEQ_TRANSPORT=accessory` talks to a real unit
through the Pi's accessory gadget -- see `accessory_transport.py`. That is
the one that reaches a DEQ in the car, and it is how the Pi runs.
`DEQ_TRANSPORT=usb` talks to a unit plugged into this machine's own port
through `usb_transport.py`, which needs the `usb` extra
(`uv sync --extra usb`).

The direct USB transport has never answered a real unit, because a
laptop's USB-C port is usually host-only hardware and the DEQ is itself a
USB host when connected this way -- see `USB_CAPTURE_NOTES.md` in the
outer repo. The Pi answers it because the gadget presents the device side,
which is why `accessory` is the real path and `usb` is kept only for a
machine that can do the same. `scripts/check_real_deq.py` runs the
conformance check over either one.
"""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass

from app.deq_blob import UserConfiguration
from app.deq_session import DeqSession, SessionError
from app.deq_transport import Transport, TransportError
from app.eq_data import TuningData

TRANSPORT_ENVIRONMENT_VARIABLE = "DEQ_TRANSPORT"
FAKE_TRANSPORT_NAME = "fake"
SIMULATOR_TRANSPORT_NAME = "simulator"
USB_TRANSPORT_NAME = "usb"
ACCESSORY_TRANSPORT_NAME = "accessory"

# How long the link keeper waits between tries. The unit is wired to the
# car, so a wait of a few seconds is short against the time it takes a
# person to switch the ignition on and open the app.
DEFAULT_RETRY_SECONDS = 3.0

# How long `stop` waits for the loop's thread to finish.
STOP_WAIT_SECONDS = 5.0


class DeviceUnavailable(Exception):
    """The unit is not reachable. The message is for a person to read."""


@dataclass(frozen=True)
class DeviceState:
    """What the header shows about the unit."""

    connected: bool
    firmware_version: str | None = None
    serial: str | None = None
    # Why the link is down, in words a person can act on.
    problem: str | None = None


def build_transport(name: str | None = None) -> Transport:
    """Returns the transport named by the environment.

    An unknown name is an error rather than a silent fall back to the fake:
    a deployment that asks for real hardware and quietly gets a simulation
    is worse than one that refuses to start.
    """
    if name is None:
        name = os.environ.get(TRANSPORT_ENVIRONMENT_VARIABLE, FAKE_TRANSPORT_NAME)
    if name == FAKE_TRANSPORT_NAME:
        from app.testing.fake_deq import FakeDeq

        return FakeDeq()
    if name == SIMULATOR_TRANSPORT_NAME:
        from app.deq_simulator_transport import DeqSimulator

        return DeqSimulator()
    if name == USB_TRANSPORT_NAME:
        from app.usb_transport import UsbTransport

        return UsbTransport()
    if name == ACCESSORY_TRANSPORT_NAME:
        from app.accessory_transport import AccessoryTransport

        return AccessoryTransport()
    raise DeviceUnavailable(
        f"no transport named {name!r}. "
        f"Use {TRANSPORT_ENVIRONMENT_VARIABLE}={FAKE_TRANSPORT_NAME}, "
        f"{TRANSPORT_ENVIRONMENT_VARIABLE}={SIMULATOR_TRANSPORT_NAME}, "
        f"{TRANSPORT_ENVIRONMENT_VARIABLE}={ACCESSORY_TRANSPORT_NAME}, "
        f"or {TRANSPORT_ENVIRONMENT_VARIABLE}={USB_TRANSPORT_NAME}."
    )


class DeqDevice:
    """Keeps one DEQ session, and starts it when it is first needed.

    It answers what the unit is and pushes settings to it; you call its
    methods from a route handler; it depends on a transport factory and on
    `DeqSession`.

    One lock guards the link, because two threads reach it: the HTTP
    handlers, and `LinkKeeper`'s thread reconnecting. The protocol is one
    request and then its reply over a single transport, so two threads
    writing at once would interleave frames and leave the conversation out
    of step. The lock makes one whole exchange the unit of work, not one
    write.
    """

    def __init__(self, build_transport_function=build_transport) -> None:
        self.build_transport_function = build_transport_function
        self._session: DeqSession | None = None
        self._identity = None
        self._link_lock = threading.RLock()
        # Why the last connection failed, so `state()` can say. Without
        # this the app reports a down link and no reason, and the reason is
        # the only part a person can act on.
        self._problem: str | None = None

    def connect(self) -> DeviceState:
        """Opens the link and runs the unit's startup sequence."""
        with self._link_lock:
            try:
                session = DeqSession(self.build_transport_function())
                session.start()
                self._identity = session.read_device_identity()
            except (SessionError, TransportError, DeviceUnavailable) as caught_error:
                self.disconnect()
                self._problem = str(caught_error)
                return DeviceState(connected=False, problem=self._problem)
            self._session = session
            self._problem = None
            return self.state()

    def state(self) -> DeviceState:
        """Returns what the header shows, without opening a link."""
        with self._link_lock:
            if self._session is None or self._identity is None:
                return DeviceState(connected=False, problem=self._problem)
            return DeviceState(
                connected=True,
                firmware_version=format_firmware_version(
                    self._identity.firmware_version
                ),
                serial=self._identity.serial,
            )

    def disconnect(self) -> None:
        with self._link_lock:
            if self._session is not None:
                self._session.close()
            self._session = None
            self._identity = None

    def require_session(self) -> DeqSession:
        """Returns the live session, or says the unit is not connected."""
        if self._session is None:
            raise DeviceUnavailable("the unit is not connected")
        return self._session

    def write_tuning(self, tuning: TuningData) -> None:
        self.run(lambda session: session.write_tuning(tuning))

    def read_configuration(self) -> UserConfiguration:
        return self.run(lambda session: session.read_user_configuration())

    def run(self, action):
        """Runs one action against the unit, turning a failure into words.

        A session error means the link is no longer trustworthy, so the
        link is dropped and `LinkKeeper` opens a new one.

        The lock covers the whole action. One action is one or more
        request-and-reply exchanges, and another thread sending a frame
        between them would answer the wrong request.
        """
        with self._link_lock:
            session = self.require_session()
            try:
                return action(session)
            except (SessionError, TransportError) as caught_error:
                self.disconnect()
                raise DeviceUnavailable(str(caught_error)) from caught_error


class LinkKeeper:
    """Keeps one device connected, retrying for as long as it runs.

    It calls `connect` until the link is up and again whenever it drops;
    you `start` it once and `stop` it at shutdown; it depends on a device
    and on a clock it can wait against.

    The link is a fact the app reports, never a thing a user starts. The
    unit is wired to the car, the bridge holding the USB link retries by
    itself, and both come up with the ignition, so there is nothing a
    person could usefully press. This is the same loop one layer up.

    The waiting is injected so a test does not sleep. `wait_function`
    takes a number of seconds and returns True to keep running, which is
    how `stop` interrupts a wait instead of outliving it.
    """

    def __init__(
        self,
        unit: DeqDevice,
        retry_seconds: float = DEFAULT_RETRY_SECONDS,
        wait_function=None,
    ) -> None:
        self.unit = unit
        self.retry_seconds = retry_seconds
        self._stop_requested = threading.Event()
        self.wait_function = wait_function or self._wait_on_event
        self._thread: threading.Thread | None = None

    def _wait_on_event(self, seconds: float) -> bool:
        """Waits, and returns False as soon as `stop` is called."""
        return not self._stop_requested.wait(seconds)

    def start(self) -> None:
        """Starts the loop in its own thread.

        A thread and not an asyncio task: a transport read blocks for its
        whole timeout, and blocking the event loop would stall every HTTP
        request the app is serving at the time.
        """
        if self._thread is not None:
            return
        self._stop_requested.clear()
        self._thread = threading.Thread(
            target=self.run, name="deq-link-keeper", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        """Asks the loop to finish, and waits for it to notice."""
        self._stop_requested.set()
        thread = self._thread
        self._thread = None
        if thread is not None:
            thread.join(timeout=STOP_WAIT_SECONDS)

    def is_running(self) -> bool:
        """Returns whether the loop's thread is alive."""
        thread = self._thread
        return thread is not None and thread.is_alive()

    def run(self) -> None:
        """Connects, then watches, until asked to stop."""
        while True:
            if not self.unit.state().connected:
                self.connect_once()
            if not self.wait_function(self.retry_seconds):
                return

    def connect_once(self) -> DeviceState:
        """Tries one connection and never raises.

        A failure here is a normal state -- the car is off, or the bridge
        has no link yet -- and the reason reaches the app through
        `DeviceState.problem`. A raise would only kill the thread that has
        to try again.
        """
        try:
            return self.unit.connect()
        except Exception as caught_error:
            # connect() already turns the errors it expects into a state.
            # Anything else still must not stop the retrying.
            return DeviceState(connected=False, problem=str(caught_error))


def format_firmware_version(raw_version: int) -> str:
    """Returns the version the way the app shows it, for example `2.02`.

    The unit sends two bytes. The app's own connect screen reads them as a
    major and a minor part, which is where the `2.02` in the captured
    accessory string comes from.
    """
    return f"{raw_version >> 8}.{raw_version & 0xFF:02d}"


# The app keeps one unit, so one device object serves every request.
device = DeqDevice()

# One keeper for that device. `main.py` starts it with the app and stops
# it at shutdown.
link_keeper = LinkKeeper(device)

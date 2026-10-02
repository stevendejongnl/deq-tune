"""Holds the one link to the DEQ unit.

The backend owns the link, not the browser. A laptop reaches the unit over
its own USB port, and later an ESP wired to the unit's port runs the same
code. Either way the process that holds the handle is this one, so the
frontend reads device state over HTTP like any other data.

Which transport that link uses is configuration. `DEQ_TRANSPORT=fake` is
the default, which talks to `testing/fake_deq.py` so the whole app runs end
to end with no hardware. `DEQ_TRANSPORT=usb` talks to a real unit through
`usb_transport.py`, which needs the `usb` extra (`uv sync --extra usb`).

No real unit has answered that USB transport yet, because the DEQ has never
enumerated on the development laptop. `scripts/check_real_deq.py` is the
script to run once one does.
"""

from __future__ import annotations

import os
from dataclasses import dataclass

from app.deq_blob import UserConfiguration
from app.deq_session import DeqSession, SessionError
from app.deq_transport import Transport, TransportError
from app.eq_data import TuningData

TRANSPORT_ENVIRONMENT_VARIABLE = "DEQ_TRANSPORT"
FAKE_TRANSPORT_NAME = "fake"
USB_TRANSPORT_NAME = "usb"


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
    if name == USB_TRANSPORT_NAME:
        from app.usb_transport import UsbTransport

        return UsbTransport()
    raise DeviceUnavailable(
        f"no transport named {name!r}. "
        f"Use {TRANSPORT_ENVIRONMENT_VARIABLE}={FAKE_TRANSPORT_NAME} "
        f"or {TRANSPORT_ENVIRONMENT_VARIABLE}={USB_TRANSPORT_NAME}."
    )


class DeqDevice:
    """Keeps one DEQ session, and starts it when it is first needed.

    It answers what the unit is and pushes settings to it; you call its
    methods from a route handler; it depends on a transport factory and on
    `DeqSession`.
    """

    def __init__(self, build_transport_function=build_transport) -> None:
        self.build_transport_function = build_transport_function
        self._session: DeqSession | None = None
        self._identity = None

    def connect(self) -> DeviceState:
        """Opens the link and runs the unit's startup sequence."""
        try:
            session = DeqSession(self.build_transport_function())
            session.start()
            self._identity = session.read_device_identity()
        except (SessionError, TransportError, DeviceUnavailable) as caught_error:
            self.disconnect()
            return DeviceState(connected=False, problem=str(caught_error))
        self._session = session
        return self.state()

    def state(self) -> DeviceState:
        """Returns what the header shows, without opening a link."""
        if self._session is None or self._identity is None:
            return DeviceState(connected=False)
        return DeviceState(
            connected=True,
            firmware_version=format_firmware_version(self._identity.firmware_version),
            serial=self._identity.serial,
        )

    def disconnect(self) -> None:
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
        link is dropped and the next request reconnects.
        """
        session = self.require_session()
        try:
            return action(session)
        except (SessionError, TransportError) as caught_error:
            self.disconnect()
            raise DeviceUnavailable(str(caught_error)) from caught_error


def format_firmware_version(raw_version: int) -> str:
    """Returns the version the way the app shows it, for example `2.02`.

    The unit sends two bytes. The app's own connect screen reads them as a
    major and a minor part, which is where the `2.02` in the captured
    accessory string comes from.
    """
    return f"{raw_version >> 8}.{raw_version & 0xFF:02d}"


# The app keeps one unit, so one device object serves every request.
device = DeqDevice()

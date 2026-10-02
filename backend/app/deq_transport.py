"""The seam between the DEQ's command sequence and the wire under it.

`DeqSession` drives the conversation; a transport moves the bytes. Keeping
them apart is what lets the same session code run against three different
links: a hand-written fake in the tests, libusb when the unit is plugged
into the machine running this backend, and later an ESP wired to the
unit's own USB port.

A transport carries whole frames, not payloads. `deq_protocol` already
knows where a frame starts and ends, so a transport only has to deliver
one when it has one.
"""

from __future__ import annotations

from typing import Protocol


class TransportError(Exception):
    """The link failed. The message says what a person should check."""


class TransportTimeout(TransportError):
    """No frame arrived before the deadline."""


class Transport(Protocol):
    """Moves one frame at a time over one link.

    It sends and receives whole frames; you call `send_frame` then
    `receive_frame`; it depends on whatever link it wraps and nothing in
    this app.
    """

    def send_frame(self, frame: bytes) -> None:
        """Puts one frame on the wire."""
        ...

    def receive_frame(self, timeout_seconds: float) -> bytes:
        """Returns the next frame, or raises `TransportTimeout`."""
        ...

    def close(self) -> None:
        """Releases the link. Calling it twice is safe."""
        ...

"""Moves DEQ frames through the Pi's accessory gadget.

This is a `Transport`, so `DeqSession` drives it exactly as it drives the
fake unit. It needs no optional dependency: a Unix socket is stdlib.

Why it is not a direct open of `/dev/usb_accessory`. Two writers on one
link interleave frames, and the gadget program has to keep that handle.
`pi-gadget/deq_accessory.py` owns the USB lifecycle -- it answers the
DEQ's mode-switch request, re-enumerates the gadget, puts the accessory
interface at index 2, and feeds the audio function the unit demands. None
of that is the backend's job, and the handle cannot be shared.

So the gadget relays instead. It listens on `ACCESSORY_SOCKET_PATH` and
passes whole frames both ways, byte for byte. While a backend is attached
the gadget stops sending its own cold start and keepalives, because the
session the backend runs carries them: two keepalive clocks on one link
is the same interleaving problem in a slower form.

The frame markers survive the hop unchanged, so `FrameJoiner` finds the
edges here the same way it does on a bulk USB read. A socket read returns
whatever has arrived, like a serial port and unlike a bulk endpoint, so
this reads what is available rather than one fixed-size packet.
"""

from __future__ import annotations

import socket

from app.deq_transport import (
    FrameJoiner,
    TransportError,
    TransportTimeout,
    receive_frame_by_reading,
)

# Where the gadget listens. It is a path, not a port, so only a process on
# this Pi can reach it and no firewall rule has to protect it.
ACCESSORY_SOCKET_PATH = "/run/deq-accessory.sock"

# How many bytes to ask the socket for at once. Generous relative to one
# DEQ frame, so a whole frame usually arrives in one read.
READ_CHUNK_BYTES = 4096


class AccessoryUnavailable(TransportError):
    """The gadget is not relaying. The message says what to check."""


class AccessoryTransport:
    """Carries DEQ frames over a Unix socket to the gadget program.

    It sends and receives whole frames; `DeqSession` calls it; it depends
    on `deq_accessory.py` running on this machine with its relay enabled.
    """

    def __init__(
        self,
        socket_path: str = ACCESSORY_SOCKET_PATH,
        connection=None,
    ) -> None:
        self.connection = (
            connection if connection is not None else open_accessory_socket(socket_path)
        )
        self._joiner = FrameJoiner()
        self.closed = False

    def send_frame(self, frame: bytes) -> None:
        """Writes one frame to the gadget, which writes it to the DEQ."""
        try:
            self.connection.sendall(frame)
        except Exception as caught_error:
            raise TransportError(
                f"writing {len(frame)} bytes to the gadget failed: {caught_error}"
            ) from caught_error

    def receive_frame(self, timeout_seconds: float) -> bytes:
        """Returns the next whole frame the DEQ sent."""
        return receive_frame_by_reading(
            self._joiner, lambda: self.read_available_bytes(timeout_seconds)
        )

    def read_available_bytes(self, timeout_seconds: float) -> bytes:
        """Reads whatever the gadget has relayed, or says why it could not.

        An empty read means the gadget closed the socket, which is a dead
        link rather than a slow one: the session has to be started again.
        """
        self.connection.settimeout(timeout_seconds)
        try:
            read = self.connection.recv(READ_CHUNK_BYTES)
        except socket.timeout as caught_error:
            raise TransportTimeout(
                f"the gadget sent nothing within {timeout_seconds} seconds"
            ) from caught_error
        except Exception as caught_error:
            raise TransportError(
                f"reading from the gadget failed: {caught_error}"
            ) from caught_error
        if len(read) == 0:
            raise TransportError(
                "the gadget closed the link. Check the DEQ is still powered "
                "and `journalctl -u deq-accessory` for why the session ended."
            )
        return bytes(read)

    def close(self) -> None:
        """Releases the socket. Calling it twice is safe."""
        if self.closed:
            return
        self.closed = True
        try:
            self.connection.close()
        except Exception:
            # The link is being given up anyway, so a failure here is not
            # worth raising over.
            pass


def open_accessory_socket(socket_path: str):
    """Returns an open connection to the gadget's relay, or says why not."""
    connection = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    try:
        connection.connect(socket_path)
    except OSError as caught_error:
        connection.close()
        raise AccessoryUnavailable(
            f"could not reach the gadget at {socket_path}: {caught_error}. "
            "Check `systemctl status deq-accessory` and that the DEQ has "
            "asked for accessory mode: the relay exists only during a session."
        ) from caught_error
    return connection

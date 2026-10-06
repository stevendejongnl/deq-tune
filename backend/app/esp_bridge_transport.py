"""Moves DEQ frames through an ESP32-S3 acting as a dumb USB-host bridge.

This is a `Transport`, so `DeqSession` drives it exactly as it drives the
fake unit or a direct USB link. It needs `pyserial`, which is an optional
dependency: install it with `uv sync --extra esp-bridge`.

The ESP firmware, which is not in this repository, understands nothing
about the DEQ's protocol. It is a USB host plugged into the DEQ's own port, and it
relays whatever bytes arrive on that USB connection straight onto its
UART, in both directions, unchanged. `deq_protocol.py`'s frame markers
(`0xf0` .. `0xf7`, with the 512-byte pad rule) already delimit a frame
inside that byte stream, so this class only has to find them -- the same
job `usb_transport.py`'s `take_frame_from_buffer` does, reused here
because a serial link carries the identical bytes a bulk USB link would.

The difference from `UsbTransport` is what feeds the buffer: a serial
port has no fixed packet size to read in chunks of, so this reads
whatever bytes are available each time, up to the bridge's own buffer
size, rather than one fixed-size USB packet.
"""

from __future__ import annotations

from app.deq_transport import TransportError, TransportTimeout

FRAME_END_MARKER = 0xF7

# One bulk packet on the DEQ's own USB link. The codec's 512-byte pad rule
# depends on this, same as usb_transport.py -- the ESP relays the DEQ's
# own framing unchanged, so the same rule applies here.
BULK_PACKET_BYTES = 512

# A frame never exceeds this. Same bound as usb_transport.py.
MAX_FRAME_BYTES = 8192

# How many bytes to ask the serial port for at once. Generous relative to
# one DEQ frame's nibble-expanded size, so a full frame usually arrives in
# one read.
READ_CHUNK_BYTES = 4096

DEFAULT_BAUD_RATE = 921_600


class EspBridgeUnavailable(TransportError):
    """`pyserial` is missing, or the bridge is not on the expected port."""


def find_pyserial():
    """Returns the `serial` module, or says how to install it.

    The import sits in a function so the app starts without `pyserial`.
    """
    try:
        import serial
    except ModuleNotFoundError as caught_error:
        raise EspBridgeUnavailable(
            "pyserial is not installed. Run `uv sync --extra esp-bridge` "
            "to talk to a DEQ through the ESP bridge."
        ) from caught_error
    return serial


class EspBridgeTransport:
    """Carries DEQ frames over a serial link to an ESP USB-host bridge.

    It sends and receives whole frames; `DeqSession` calls it; it depends
    on `pyserial` and on the ESP bridge being connected and running its
    relay firmware.
    """

    def __init__(self, port: str, baud_rate: int = DEFAULT_BAUD_RATE, connection=None) -> None:
        self.connection = connection if connection is not None else open_serial_port(port, baud_rate)
        self._buffer = bytearray()
        self.closed = False

    def send_frame(self, frame: bytes) -> None:
        """Writes one frame to the bridge's serial port."""
        try:
            written = self.connection.write(frame)
        except Exception as caught_error:
            raise TransportError(f"writing {len(frame)} bytes failed: {caught_error}") from (
                caught_error
            )
        if written != len(frame):
            raise TransportError(f"wrote {written} of {len(frame)} bytes")

    def receive_frame(self, timeout_seconds: float) -> bytes:
        """Returns the next whole frame.

        A serial read returns whatever bytes are available, not one frame
        at a time, so this reads until the end marker rather than
        assuming one read is one frame -- the same approach
        `UsbTransport.receive_frame` takes for bulk packets.
        """
        self.connection.timeout = timeout_seconds
        while True:
            frame = self.take_frame_from_buffer()
            if frame is not None:
                return frame
            if len(self._buffer) > MAX_FRAME_BYTES:
                raise TransportError(
                    f"no frame end in {len(self._buffer)} bytes; the link is out of step"
                )
            self._buffer += self.read_available_bytes(timeout_seconds)

    def take_frame_from_buffer(self) -> bytes | None:
        """Returns the first whole frame the buffer holds, if it holds one.

        A frame that is an exact multiple of 512 bytes carries one zero
        byte after its end marker, so that byte is taken with it. Same
        rule as `UsbTransport.take_frame_from_buffer`, because the ESP
        relays the DEQ's own framing unchanged.
        """
        end = self._buffer.find(FRAME_END_MARKER)
        if end == -1:
            return None
        length = end + 1
        if length % BULK_PACKET_BYTES == 0 and len(self._buffer) > length:
            length += 1
        frame = bytes(self._buffer[:length])
        del self._buffer[:length]
        return frame

    def read_available_bytes(self, timeout_seconds: float) -> bytes:
        """Reads whatever the bridge has sent, or says why it could not."""
        try:
            read = self.connection.read(READ_CHUNK_BYTES)
        except Exception as caught_error:
            raise TransportError(f"reading from the bridge failed: {caught_error}") from (
                caught_error
            )
        if len(read) == 0:
            raise TransportTimeout(f"the bridge sent nothing within {timeout_seconds} seconds")
        return bytes(read)

    def close(self) -> None:
        """Releases the serial port. Calling it twice is safe."""
        if self.closed:
            return
        self.closed = True
        try:
            self.connection.close()
        except Exception:
            # The link is being given up anyway, so a failure here is not
            # worth raising over.
            pass


def open_serial_port(port: str, baud_rate: int):
    """Returns an open serial connection to the ESP bridge, or says why not."""
    serial = find_pyserial()
    try:
        return serial.Serial(port, baudrate=baud_rate)
    except Exception as caught_error:
        raise EspBridgeUnavailable(
            f"could not open {port}: {caught_error}. "
            "Check the ESP bridge is plugged in and its relay firmware is running."
        ) from caught_error

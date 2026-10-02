"""Moves DEQ frames over a real USB link.

This is a `Transport`, so `DeqSession` drives it exactly as it drives the
fake unit. It needs `pyusb`, which is an optional dependency: install it
with `uv sync --extra usb`. Without it the app still runs on the fake
transport.

What the Pioneer app does, and what this copies:

- The unit is `08e4:01ed`, from the app's own `otg_device_filter.xml`.
  That file also lists a vendor-wide `08e4:ffff`, so this tries the exact
  product first and then any Pioneer device.
- The native library the app ships, `libaeusb.so`, is stock libusb, and it
  calls `libusb_bulk_transfer`. So the frames move over a bulk endpoint
  pair, not control transfers.
- A frame whose length is an exact multiple of 512 carries one extra zero
  byte. `deq_protocol.pack_frame` already adds it. That rule only makes
  sense for a 512-byte bulk endpoint, and it is what stops a full-size
  frame from looking like the end of a transfer.

The endpoints are not written down anywhere in the app, so this reads them
off the device's own descriptors rather than hard-coding a number.

**No real unit has been driven with this yet.** The DEQ has never
enumerated on the development laptop, in either position of its mode
switch, so this code is written from the protocol and the app's own native
calls, not from a session it has completed. `scripts/check_real_deq.py`
is the script to run once a unit does appear: it exercises this transport
against the hardware and says what matched.
"""

from __future__ import annotations

from app.deq_transport import TransportError, TransportTimeout

PIONEER_VENDOR_ID = 0x08E4
DEQ_PRODUCT_ID = 0x01ED
# The app's filter lists this alongside the exact product id, so a unit
# with another product id is still worth trying.
PIONEER_ANY_PRODUCT_ID = 0xFFFF

# One bulk packet. The codec's 512-byte pad rule depends on this.
BULK_PACKET_BYTES = 512

# A frame never exceeds this. The biggest one seen is the 4209-byte
# coefficient write, so this leaves room and still bounds a bad read.
MAX_FRAME_BYTES = 8192

FRAME_END_MARKER = 0xF7


class UsbUnavailable(TransportError):
    """`pyusb` is missing, or no DEQ is on the bus."""


def find_usb_core():
    """Returns `usb.core`, or says how to install it.

    The import sits in a function so the app starts without `pyusb`.
    """
    try:
        import usb.core
    except ModuleNotFoundError as caught_error:
        raise UsbUnavailable(
            "pyusb is not installed. Run `uv sync --extra usb` to talk to a real unit."
        ) from caught_error
    return usb.core


class UsbTransport:
    """Carries DEQ frames over a bulk endpoint pair.

    It sends and receives whole frames; `DeqSession` calls it; it depends
    on `pyusb` and on a DEQ being on the bus.
    """

    def __init__(self, device=None) -> None:
        self.device = device if device is not None else find_deq()
        self.interface_number, self.in_endpoint, self.out_endpoint = claim_bulk_interface(
            self.device
        )
        self._buffer = bytearray()
        self.closed = False

    def send_frame(self, frame: bytes) -> None:
        """Writes one frame to the unit's bulk OUT endpoint."""
        try:
            written = self.out_endpoint.write(frame)
        except Exception as caught_error:
            raise TransportError(f"writing {len(frame)} bytes failed: {caught_error}") from (
                caught_error
            )
        if written != len(frame):
            raise TransportError(f"wrote {written} of {len(frame)} bytes")

    def receive_frame(self, timeout_seconds: float) -> bytes:
        """Returns the next whole frame.

        A bulk read returns one packet at a time, so a frame larger than
        512 bytes arrives in pieces. This reads until the end marker
        rather than assuming one read is one frame.
        """
        timeout_milliseconds = max(1, int(timeout_seconds * 1000))
        while True:
            frame = self.take_frame_from_buffer()
            if frame is not None:
                return frame
            if len(self._buffer) > MAX_FRAME_BYTES:
                raise TransportError(
                    f"no frame end in {len(self._buffer)} bytes; the link is out of step"
                )
            self._buffer += self.read_one_packet(timeout_milliseconds)

    def take_frame_from_buffer(self) -> bytes | None:
        """Returns the first whole frame the buffer holds, if it holds one.

        A frame that is an exact multiple of 512 bytes carries one zero
        byte after its end marker, so that byte is taken with it.
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

    def read_one_packet(self, timeout_milliseconds: int) -> bytes:
        """Reads one bulk packet, or says why it could not.

        A timeout is told apart by the name of the exception rather than by
        importing `pyusb` to get the class. That keeps the framing above
        this method working without the optional dependency, which is how
        it is tested.
        """
        try:
            return bytes(self.in_endpoint.read(BULK_PACKET_BYTES, timeout_milliseconds))
        except Exception as caught_error:
            if is_timeout(caught_error):
                raise TransportTimeout(
                    f"the unit sent nothing within {timeout_milliseconds} ms"
                ) from caught_error
            raise TransportError(f"reading from the unit failed: {caught_error}") from (
                caught_error
            )

    def close(self) -> None:
        """Releases the interface. Calling it twice is safe."""
        if self.closed:
            return
        self.closed = True
        try:
            import usb.util

            usb.util.release_interface(self.device, self.interface_number)
            self.device.reset()
        except Exception:
            # The link is being given up anyway, so a failure here is not
            # worth raising over.
            pass


def is_timeout(caught_error: BaseException) -> bool:
    """Says whether one exception is a USB read timeout.

    `pyusb` raises `usb.core.USBTimeoutError`, and this reads its name so
    the check needs no import. A timeout means the unit simply had nothing
    to send, which is not the same as a broken link.
    """
    return type(caught_error).__name__ == "USBTimeoutError"


def find_deq():
    """Returns the DEQ on the bus, or says it is not there."""
    usb_core = find_usb_core()
    device = usb_core.find(idVendor=PIONEER_VENDOR_ID, idProduct=DEQ_PRODUCT_ID)
    if device is None:
        device = usb_core.find(idVendor=PIONEER_VENDOR_ID)
    if device is None:
        raise UsbUnavailable(
            f"no Pioneer device on the bus. Looked for "
            f"{PIONEER_VENDOR_ID:04x}:{DEQ_PRODUCT_ID:04x} and any "
            f"{PIONEER_VENDOR_ID:04x} device. Check the unit's power and its "
            "USB mode switch."
        )
    return device


def claim_bulk_interface(device):
    """Claims the unit's bulk interface and returns its endpoints.

    The app's own code reads the descriptors rather than naming an
    endpoint, because an accessory numbers them as it likes.
    """
    import usb.util

    try:
        device.set_configuration()
    except Exception as caught_error:
        raise UsbUnavailable(
            f"could not configure the unit: {caught_error}. "
            "On Linux this usually means another driver holds it, or the "
            "user cannot open the device."
        ) from caught_error

    configuration = device.get_active_configuration()
    for interface in configuration:
        in_endpoint = find_bulk_endpoint(interface, usb.util.ENDPOINT_IN)
        out_endpoint = find_bulk_endpoint(interface, usb.util.ENDPOINT_OUT)
        if in_endpoint is None or out_endpoint is None:
            continue
        usb.util.claim_interface(device, interface.bInterfaceNumber)
        return interface.bInterfaceNumber, in_endpoint, out_endpoint

    raise UsbUnavailable(
        "the unit offers no interface with a bulk endpoint in each direction"
    )


def find_bulk_endpoint(interface, direction):
    """Returns one bulk endpoint of an interface, by direction."""
    import usb.util

    for endpoint in interface:
        is_bulk = (
            usb.util.endpoint_type(endpoint.bmAttributes) == usb.util.ENDPOINT_TYPE_BULK
        )
        if is_bulk and usb.util.endpoint_direction(endpoint.bEndpointAddress) == direction:
            return endpoint
    return None

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

from app.deq_transport import (
    BULK_PACKET_BYTES,
    FrameJoiner,
    TransportError,
    TransportTimeout,
    receive_frame_by_reading,
)

PIONEER_VENDOR_ID = 0x08E4
DEQ_PRODUCT_ID = 0x01ED


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

    def __init__(self, device=None, endpoints=None) -> None:
        """Opens the link, or takes endpoints a caller already has.

        `endpoints` is the seam the framing tests use: an interface number
        and an IN and OUT endpoint. Passing it skips both the bus search
        and the interface claim, so the framing can be tested with no
        `pyusb` installed and no unit on the bus.
        """
        if endpoints is None:
            self.device = device if device is not None else find_deq()
            self.interface_number, self.in_endpoint, self.out_endpoint = (
                claim_bulk_interface(self.device)
            )
        else:
            self.device = device
            self.interface_number, self.in_endpoint, self.out_endpoint = endpoints
        self._joiner = FrameJoiner()
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
        512 bytes arrives in pieces. `FrameJoiner` finds the edge.
        """
        timeout_milliseconds = max(1, int(timeout_seconds * 1000))
        return receive_frame_by_reading(
            self._joiner, lambda: self.read_one_packet(timeout_milliseconds)
        )

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
        # The app's filter also lists a vendor-wide 0xffff product id, so a
        # unit enumerating under another product id is still worth trying.
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
            "On Linux this usually means the user cannot open the device; "
            "install scripts/99-pioneer-deq.rules as a udev rule."
        ) from caught_error

    configuration = device.get_active_configuration()
    for interface in configuration:
        in_endpoint = find_bulk_endpoint(interface, usb.util.ENDPOINT_IN)
        out_endpoint = find_bulk_endpoint(interface, usb.util.ENDPOINT_OUT)
        if in_endpoint is None or out_endpoint is None:
            continue
        detach_kernel_driver(device, interface.bInterfaceNumber)
        usb.util.claim_interface(device, interface.bInterfaceNumber)
        return interface.bInterfaceNumber, in_endpoint, out_endpoint

    raise UsbUnavailable(
        "the unit offers no interface with a bulk endpoint in each direction"
    )


def detach_kernel_driver(device, interface_number: int) -> None:
    """Takes an interface off the kernel, if the kernel holds it.

    A unit that presents itself as audio or as a serial port gets a kernel
    driver bound to it, and `claim_interface` then fails. The Pioneer app
    meets the same problem: its own libusb exports
    `libusb_detach_kernel_driver` and `libusb_kernel_driver_active`.

    A kernel that cannot answer the question is not an error here. The
    claim that follows is what decides, and it reports the real reason.
    """
    try:
        if device.is_kernel_driver_active(interface_number):
            device.detach_kernel_driver(interface_number)
    except NotImplementedError:
        # No kernel driver concept on this platform, so nothing to detach.
        pass
    except Exception:
        # Let the claim report what is actually wrong.
        pass


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

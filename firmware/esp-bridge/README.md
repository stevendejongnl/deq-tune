# The ESP bridge firmware

Runs on an ESP32-S3 board with two USB-C ports: one wired to the chip's
native USB-OTG peripheral, one wired through a USB-serial chip to the
chip's UART0. Plug the DEQ into the OTG port; plug the other port into
whatever runs the deq-tune backend.

This firmware understands nothing about the DEQ's own protocol. It is a
dumb byte relay: every byte the DEQ sends on its bulk USB IN endpoint goes
straight onto UART0; every byte that arrives on UART0 goes straight to
the DEQ's bulk OUT endpoint. The SysEx framing, command parsing, and
everything else that knows what a DEQ frame means stays in
`backend/app/deq_protocol.py`, unchanged — this board only relocates
where the USB host role physically runs. `backend/app/esp_bridge_transport.py`
is the Python side of this link; it implements the same `Transport`
protocol `backend/app/usb_transport.py` does, over a serial port instead
of a direct USB link.

## Which board

Needs an ESP32-S3 (or S2, or P4) specifically — the plain ESP32 and the
C-series chips (C3, C6, ...) have no USB host-mode hardware at all, only
a device-only USB-Serial/JTAG peripheral. Confirmed the hard way this
project ran into first; see `USB_CAPTURE_NOTES.md` in the outer repo.

Needs **two separate USB-C ports**: one wired to the chip's native
USB-OTG pins (GPIO19/GPIO20 on the S3), one for programming and this
relay's own serial link. A board with only one USB-C port usually only
exposes the programming port and cannot do this.

## Building and flashing

Needs [ESP-IDF](https://docs.espressif.com/projects/esp-idf/en/stable/esp32s3/get-started/index.html)
v5.3 or later, installed for the `esp32s3` target.

```bash
. $IDF_PATH/export.sh   # once per shell
cd firmware/esp-bridge
idf.py set-target esp32s3   # once per checkout
idf.py build
idf.py -p /dev/ttyACM0 flash monitor   # port is the board's UART port, not its OTG port
```

`idf.py monitor` shows this firmware's own log lines (device found,
interface claimed, transfer errors) — useful on its own, with nothing
plugged into the OTG port yet, to confirm the firmware boots and the USB
host library installs.

## Using it from the backend

```bash
cd backend && uv sync --extra esp-bridge
```

Then construct `app.esp_bridge_transport.EspBridgeTransport` with the
board's UART port (the same one `idf.py flash` used) and hand it to
`DeqSession`, the same way `UsbTransport` is used today.

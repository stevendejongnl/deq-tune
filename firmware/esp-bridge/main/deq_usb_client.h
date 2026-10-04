// SPDX-License-Identifier: AGPL-3.0-or-later
//
// The USB host side of the bridge: finds the DEQ on the bus, claims its
// bulk interface, and moves raw bytes to and from it. It knows nothing
// about the DEQ's own protocol -- see bridge_main.c's module comment for
// why that split exists.
#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#include "esp_err.h"

#ifdef __cplusplus
extern "C" {
#endif

// From the Pioneer app's own otg_device_filter.xml, same constants
// backend/app/usb_transport.py uses.
#define DEQ_USB_VENDOR_ID 0x08E4
#define DEQ_USB_PRODUCT_ID 0x01ED

// One bulk IN read's buffer size. The DEQ's own bulk packets are 512
// bytes (see deq_protocol.py's docstring); this is generous above that
// so one read usually captures a whole short frame.
#define DEQ_USB_READ_BUFFER_BYTES 2048

// Called once for every chunk of bytes the DEQ sends on its bulk IN
// endpoint, as soon as each one arrives. The bridge relays each chunk
// onto UART unchanged -- framing is the Python side's job, not this one.
typedef void (*deq_usb_bytes_received_cb_t)(const uint8_t *data, size_t length, void *context);

// Starts the USB host stack and the task that drives it. Blocks until
// the host library itself is installed (not until a DEQ is found --
// that happens asynchronously once one is plugged in).
esp_err_t deq_usb_client_start(deq_usb_bytes_received_cb_t on_bytes_received, void *context);

// Queues `length` bytes for the DEQ's bulk OUT endpoint. Returns false
// (and drops the write) if no DEQ is connected right now, rather than
// blocking -- the caller (the UART-read loop) has nowhere to put
// backpressure while it waits, and a dropped write surfaces as a
// transport timeout on the Python side, which it already reports.
bool deq_usb_client_send(const uint8_t *data, size_t length);

#ifdef __cplusplus
}
#endif

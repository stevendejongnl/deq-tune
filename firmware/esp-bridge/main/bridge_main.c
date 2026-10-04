// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A dumb byte relay between the DEQ (plugged into this board's native
// USB-OTG port, this board acting as USB host) and the deq-tune backend
// (talking over this board's UART0, which the board's own second USB-C
// port exposes through its CH343P USB-serial chip).
//
// This firmware understands nothing about the DEQ's own protocol -- no
// commands, no fields, no payload meaning. Every byte the DEQ sends goes
// straight onto UART, forwarded as soon as it arrives. Framing and
// parsing stay in Python (backend/app/deq_protocol.py), the same code
// that already does this job for a direct USB link
// (backend/app/usb_transport.py) -- this board only relocates where the
// USB host role physically runs.
// backend/app/esp_bridge_transport.py is the Python side of this link.
//
// The UART-to-USB direction needs one exception to "dumb relay": a
// DEQ frame must reach the DEQ as ONE USB bulk transfer, the same way
// UsbTransport.send_frame() hands libusb the whole frame in a single
// write() -- a frame split across several separate USB transfers is not
// the same thing on the wire as one transfer that happens to span
// several USB packets, and the DEQ is not guaranteed to treat it as a
// continuation. But UART has no transfer boundaries of its own: a
// multi-thousand-byte frame routinely arrives in several reads. So this
// file buffers UART bytes and looks for deq_protocol.py's own frame-end
// marker (0xf7, with its 512-byte pad-byte rule) before submitting --
// the same boundary rule UsbTransport.take_frame_from_buffer() already
// applies when reading a frame apart from a stream of USB packets, used
// here to reassemble one before writing it. This is a wire-level
// framing rule, not protocol content -- the firmware still never looks
// at what a frame carries.
#include <string.h>

#include "deq_usb_client.h"
#include "driver/uart.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char *TAG = "bridge";

#define BRIDGE_UART_PORT UART_NUM_0
#define BRIDGE_UART_BAUD_RATE 921600
#define BRIDGE_UART_RX_BUFFER_BYTES 4096
#define BRIDGE_UART_TX_BUFFER_BYTES 4096
#define BRIDGE_UART_READ_CHUNK_BYTES 2048
#define BRIDGE_UART_READ_TASK_STACK_BYTES 4096

// deq_protocol.py's own constants. Mirrored here, not shared, because
// this file only needs the frame *boundary*, never the content inside
// one -- see this file's module comment.
#define FRAME_END_MARKER 0xF7
#define FRAME_PAD_MULTIPLE 512

// The largest frame deq_protocol.py's own MAX_FRAME_BYTES-equivalent
// bound allows for. usb_transport.py uses the same figure for the same
// reason: generous above the biggest real frame (the 4209-byte
// coefficient write) while still bounding a stream that is out of step.
#define FRAME_BUFFER_BYTES 8192

// Called from the USB host task's context whenever the DEQ sends bytes.
// uart_write_bytes() is safe to call from any task.
static void on_deq_bytes_received(const uint8_t *data, size_t length, void *context)
{
    (void)context;
    uart_write_bytes(BRIDGE_UART_PORT, (const char *)data, length);
}

// Returns the length of the first whole frame `buffer` holds, or 0 if it
// does not hold one yet. Same rule as
// UsbTransport.take_frame_from_buffer() in usb_transport.py: a frame
// that is an exact multiple of 512 bytes carries one extra zero byte
// after its end marker, which belongs to the frame.
static size_t frame_length_if_complete(const uint8_t *buffer, size_t length)
{
    for (size_t index = 0; index < length; index++) {
        if (buffer[index] != FRAME_END_MARKER) {
            continue;
        }
        size_t frame_length = index + 1;
        if (frame_length % FRAME_PAD_MULTIPLE == 0 && length > frame_length) {
            frame_length += 1;
        }
        return frame_length;
    }
    return 0;
}

// Reads whatever the backend has sent, reassembles whole frames from it,
// and relays each one to the DEQ as a single USB transfer. Runs as its
// own task because uart_read_bytes() blocks.
static void uart_to_usb_task(void *arg)
{
    (void)arg;
    static uint8_t frame_buffer[FRAME_BUFFER_BYTES];
    size_t buffered_bytes = 0;

    while (true) {
        size_t space_remaining = FRAME_BUFFER_BYTES - buffered_bytes;
        if (space_remaining == 0) {
            ESP_LOGW(TAG, "no frame end in %d bytes from the backend; the link is out of step",
                      FRAME_BUFFER_BYTES);
            buffered_bytes = 0;
            continue;
        }

        size_t read_limit =
            space_remaining < BRIDGE_UART_READ_CHUNK_BYTES ? space_remaining : BRIDGE_UART_READ_CHUNK_BYTES;
        int read = uart_read_bytes(BRIDGE_UART_PORT, frame_buffer + buffered_bytes, read_limit,
                                    pdMS_TO_TICKS(100));
        if (read <= 0) {
            continue;
        }
        buffered_bytes += (size_t)read;

        size_t frame_length = frame_length_if_complete(frame_buffer, buffered_bytes);
        if (frame_length == 0) {
            continue;
        }

        if (!deq_usb_client_send(frame_buffer, frame_length)) {
            ESP_LOGW(TAG, "dropped a %d-byte frame from the backend: no DEQ connected",
                      (int)frame_length);
        }

        size_t remaining_bytes = buffered_bytes - frame_length;
        memmove(frame_buffer, frame_buffer + frame_length, remaining_bytes);
        buffered_bytes = remaining_bytes;
    }
}

void app_main(void)
{
    uart_config_t uart_config = {
        .baud_rate = BRIDGE_UART_BAUD_RATE,
        .data_bits = UART_DATA_8_BITS,
        .parity = UART_PARITY_DISABLE,
        .stop_bits = UART_STOP_BITS_1,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };
    ESP_ERROR_CHECK(uart_driver_install(BRIDGE_UART_PORT, BRIDGE_UART_RX_BUFFER_BYTES,
                                         BRIDGE_UART_TX_BUFFER_BYTES, 0, NULL, 0));
    ESP_ERROR_CHECK(uart_param_config(BRIDGE_UART_PORT, &uart_config));
    // No uart_set_pin() call: UART0's default pins (GPIO43/44) are
    // already wired to this board's second USB-C port through its
    // CH343P USB-serial chip -- see this file's module comment.

    ESP_LOGI(TAG, "deq-tune ESP bridge starting");
    ESP_ERROR_CHECK(deq_usb_client_start(on_deq_bytes_received, NULL));

    xTaskCreate(uart_to_usb_task, "uart_to_usb", BRIDGE_UART_READ_TASK_STACK_BYTES, NULL, 4, NULL);
}

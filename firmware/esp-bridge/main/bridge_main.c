// SPDX-License-Identifier: AGPL-3.0-or-later
//
// A dumb byte relay between the DEQ (plugged into this board's native
// USB-OTG port, this board acting as USB host) and the deq-tune backend
// (talking over this board's UART0, which the board's own second USB-C
// port exposes through its CH343P USB-serial chip).
//
// This firmware understands nothing about the DEQ's own protocol -- no
// SysEx framing, no commands, no frame markers. Every byte the DEQ sends
// goes straight onto UART; every byte that arrives on UART goes straight
// to the DEQ. Framing and parsing stay in Python
// (backend/app/deq_protocol.py), the same code that already does this
// job for a direct USB link (backend/app/usb_transport.py) -- this board
// only relocates where the USB host role physically runs.
// backend/app/esp_bridge_transport.py is the Python side of this link.
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

// Called from the USB host task's context whenever the DEQ sends bytes.
// uart_write_bytes() is safe to call from any task.
static void on_deq_bytes_received(const uint8_t *data, size_t length, void *context)
{
    (void)context;
    uart_write_bytes(BRIDGE_UART_PORT, (const char *)data, length);
}

// Reads whatever the backend has sent and relays it to the DEQ. Runs as
// its own task because uart_read_bytes() blocks.
static void uart_to_usb_task(void *arg)
{
    (void)arg;
    uint8_t buffer[BRIDGE_UART_READ_CHUNK_BYTES];

    while (true) {
        int read = uart_read_bytes(BRIDGE_UART_PORT, buffer, sizeof(buffer), pdMS_TO_TICKS(100));
        if (read <= 0) {
            continue;
        }
        if (!deq_usb_client_send(buffer, (size_t)read)) {
            ESP_LOGW(TAG, "dropped %d bytes from the backend: no DEQ connected", read);
        }
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

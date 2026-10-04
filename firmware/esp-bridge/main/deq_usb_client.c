// SPDX-License-Identifier: AGPL-3.0-or-later
#include "deq_usb_client.h"

#include <string.h>

#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"
#include "freertos/task.h"
#include "usb/usb_host.h"
#include "usb/usb_helpers.h"

static const char *TAG = "deq_usb";

#define USB_HOST_TASK_PRIORITY 5
#define USB_HOST_TASK_STACK_BYTES 4096
#define USB_CLIENT_MAX_EVENT_MSG 5

typedef struct {
    usb_host_client_handle_t client_hdl;
    usb_device_handle_t dev_hdl;
    uint8_t dev_addr;
    uint8_t interface_number;
    uint8_t in_endpoint_address;
    uint8_t out_endpoint_address;
    usb_transfer_t *in_transfer;
    bool connected;
    deq_usb_bytes_received_cb_t on_bytes_received;
    void *callback_context;
} deq_usb_client_t;

static deq_usb_client_t s_client;

// Guards every field `deq_usb_client_send()` reads
// (connected, dev_hdl, out_endpoint_address): that function runs on the
// UART task, while client_event_cb() -- the only writer of those fields,
// via open_and_claim_device()/close_device() -- runs on the USB client
// task. Without this, a DEQ unplug mid-send could use a stale dev_hdl.
// Everything else in this file (the transfer callbacks, the enumeration
// path) already runs serialized on the USB client task, per
// usb_host_client_handle_events()'s own contract, so it needs no lock.
static SemaphoreHandle_t s_connection_state_mutex;

static void submit_in_transfer(void);

static void in_transfer_cb(usb_transfer_t *transfer)
{
    if (transfer->status == USB_TRANSFER_STATUS_COMPLETED && transfer->actual_num_bytes > 0) {
        if (s_client.on_bytes_received != NULL) {
            s_client.on_bytes_received(transfer->data_buffer, transfer->actual_num_bytes,
                                        s_client.callback_context);
        }
    } else if (transfer->status != USB_TRANSFER_STATUS_COMPLETED) {
        ESP_LOGW(TAG, "bulk IN transfer failed, status=%d", transfer->status);
    }
    // Resubmit immediately so the DEQ always has a read pending. A gap
    // here is how a reply would be lost -- the DEQ does not resend one.
    if (s_client.connected) {
        submit_in_transfer();
    }
}

static void submit_in_transfer(void)
{
    s_client.in_transfer->num_bytes = DEQ_USB_READ_BUFFER_BYTES;
    s_client.in_transfer->bEndpointAddress = s_client.in_endpoint_address;
    esp_err_t submitted = usb_host_transfer_submit(s_client.in_transfer);
    if (submitted != ESP_OK) {
        ESP_LOGE(TAG, "could not submit bulk IN transfer: %s", esp_err_to_name(submitted));
    }
}

static void out_transfer_cb(usb_transfer_t *transfer)
{
    if (transfer->status != USB_TRANSFER_STATUS_COMPLETED) {
        ESP_LOGW(TAG, "bulk OUT transfer failed, status=%d", transfer->status);
    }
    usb_host_transfer_free(transfer);
}

// Finds the device's first interface offering one bulk IN and one bulk
// OUT endpoint, the same rule backend/app/usb_transport.py's
// claim_bulk_interface() uses -- the DEQ's endpoints are not documented
// anywhere, so both sides read them off the device's own descriptors.
static esp_err_t claim_bulk_interface(void)
{
    const usb_config_desc_t *config_desc;
    esp_err_t got_config = usb_host_get_active_config_descriptor(s_client.dev_hdl, &config_desc);
    if (got_config != ESP_OK) {
        return got_config;
    }

    for (int interface_number = 0; interface_number < config_desc->bNumInterfaces; interface_number++) {
        int offset = 0;
        const usb_intf_desc_t *intf_desc =
            usb_parse_interface_descriptor(config_desc, interface_number, 0, &offset);
        if (intf_desc == NULL) {
            continue;
        }

        uint8_t in_address = 0;
        uint8_t out_address = 0;
        int endpoint_offset = offset;
        for (int endpoint_index = 0; endpoint_index < intf_desc->bNumEndpoints; endpoint_index++) {
            const usb_ep_desc_t *endpoint_desc = usb_parse_endpoint_descriptor_by_index(
                intf_desc, endpoint_index, config_desc->wTotalLength, &endpoint_offset);
            if (endpoint_desc == NULL) {
                continue;
            }
            if (USB_EP_DESC_GET_XFERTYPE(endpoint_desc) != USB_TRANSFER_TYPE_BULK) {
                continue;
            }
            if (USB_EP_DESC_GET_EP_DIR(endpoint_desc)) {
                in_address = endpoint_desc->bEndpointAddress;
            } else {
                out_address = endpoint_desc->bEndpointAddress;
            }
        }

        if (in_address == 0 || out_address == 0) {
            continue;
        }

        esp_err_t claimed = usb_host_interface_claim(s_client.client_hdl, s_client.dev_hdl,
                                                       intf_desc->bInterfaceNumber, 0);
        if (claimed != ESP_OK) {
            continue;
        }

        s_client.interface_number = intf_desc->bInterfaceNumber;
        s_client.in_endpoint_address = in_address;
        s_client.out_endpoint_address = out_address;
        return ESP_OK;
    }

    return ESP_ERR_NOT_FOUND;
}

static void open_and_claim_device(void)
{
    ESP_LOGI(TAG, "DEQ found at address %d, opening", s_client.dev_addr);
    esp_err_t opened = usb_host_device_open(s_client.client_hdl, s_client.dev_addr, &s_client.dev_hdl);
    if (opened != ESP_OK) {
        ESP_LOGE(TAG, "could not open device: %s", esp_err_to_name(opened));
        return;
    }

    esp_err_t claimed = claim_bulk_interface();
    if (claimed != ESP_OK) {
        ESP_LOGE(TAG, "DEQ offers no interface with a bulk endpoint in each direction");
        usb_host_device_close(s_client.client_hdl, s_client.dev_hdl);
        s_client.dev_hdl = NULL;
        return;
    }

    esp_err_t allocated =
        usb_host_transfer_alloc(DEQ_USB_READ_BUFFER_BYTES, 0, &s_client.in_transfer);
    if (allocated != ESP_OK) {
        ESP_LOGE(TAG, "could not allocate the bulk IN transfer: %s", esp_err_to_name(allocated));
        usb_host_interface_release(s_client.client_hdl, s_client.dev_hdl, s_client.interface_number);
        usb_host_device_close(s_client.client_hdl, s_client.dev_hdl);
        s_client.dev_hdl = NULL;
        return;
    }
    s_client.in_transfer->device_handle = s_client.dev_hdl;
    s_client.in_transfer->callback = in_transfer_cb;
    s_client.in_transfer->context = NULL;

    xSemaphoreTake(s_connection_state_mutex, portMAX_DELAY);
    s_client.connected = true;
    xSemaphoreGive(s_connection_state_mutex);

    ESP_LOGI(TAG, "DEQ bulk interface %d claimed, IN=0x%02x OUT=0x%02x", s_client.interface_number,
              s_client.in_endpoint_address, s_client.out_endpoint_address);
    submit_in_transfer();
}

static void close_device(void)
{
    // Held across the whole teardown, not just the flag: a sender that
    // read connected==true a moment ago may still be about to use
    // dev_hdl, so this must not free it until that use is either
    // finished or blocked waiting for this same lock.
    xSemaphoreTake(s_connection_state_mutex, portMAX_DELAY);
    s_client.connected = false;
    usb_device_handle_t dev_hdl = s_client.dev_hdl;
    s_client.dev_hdl = NULL;
    xSemaphoreGive(s_connection_state_mutex);

    if (s_client.in_transfer != NULL) {
        usb_host_transfer_free(s_client.in_transfer);
        s_client.in_transfer = NULL;
    }
    if (dev_hdl != NULL) {
        usb_host_interface_release(s_client.client_hdl, dev_hdl, s_client.interface_number);
        usb_host_device_close(s_client.client_hdl, dev_hdl);
    }
    s_client.dev_addr = 0;
    ESP_LOGI(TAG, "DEQ disconnected");
}

static void client_event_cb(const usb_host_client_event_msg_t *event_msg, void *arg)
{
    (void)arg;
    switch (event_msg->event) {
    case USB_HOST_CLIENT_EVENT_NEW_DEV:
        if (s_client.dev_addr == 0) {
            s_client.dev_addr = event_msg->new_dev.address;
            open_and_claim_device();
        }
        break;
    case USB_HOST_CLIENT_EVENT_DEV_GONE:
        if (s_client.dev_hdl != NULL) {
            close_device();
        }
        break;
    default:
        break;
    }
}

static void usb_host_lib_task(void *arg)
{
    TaskHandle_t caller = (TaskHandle_t)arg;

    usb_host_config_t host_config = {
        .skip_phy_setup = false,
        .intr_flags = ESP_INTR_FLAG_LEVEL1,
    };
    ESP_ERROR_CHECK(usb_host_install(&host_config));
    xTaskNotifyGive(caller);

    while (true) {
        uint32_t event_flags;
        usb_host_lib_handle_events(portMAX_DELAY, &event_flags);
        // The bridge never shuts the host library down on its own -- it
        // runs for the device's whole uptime, so USB_HOST_LIB_EVENT_FLAGS_*
        // are logged only, not acted on.
    }
}

static void usb_client_task(void *arg)
{
    (void)arg;
    usb_host_client_config_t client_config = {
        .is_synchronous = false,
        .max_num_event_msg = USB_CLIENT_MAX_EVENT_MSG,
        .async = {
            .client_event_callback = client_event_cb,
            .callback_arg = NULL,
        },
    };
    ESP_ERROR_CHECK(usb_host_client_register(&client_config, &s_client.client_hdl));

    while (true) {
        usb_host_client_handle_events(s_client.client_hdl, portMAX_DELAY);
    }
}

esp_err_t deq_usb_client_start(deq_usb_bytes_received_cb_t on_bytes_received, void *context)
{
    memset(&s_client, 0, sizeof(s_client));
    s_client.on_bytes_received = on_bytes_received;
    s_client.callback_context = context;

    s_connection_state_mutex = xSemaphoreCreateMutex();
    if (s_connection_state_mutex == NULL) {
        return ESP_ERR_NO_MEM;
    }

    TaskHandle_t host_lib_task_handle;
    BaseType_t created = xTaskCreatePinnedToCore(
        usb_host_lib_task, "usb_host", USB_HOST_TASK_STACK_BYTES, xTaskGetCurrentTaskHandle(), 2,
        &host_lib_task_handle, 0);
    if (created != pdTRUE) {
        return ESP_FAIL;
    }
    // Wait for usb_host_install() to finish before the client task
    // registers, same ordering the usb_host_lib example uses.
    ulTaskNotifyTake(pdFALSE, pdMS_TO_TICKS(1000));

    TaskHandle_t client_task_handle;
    created = xTaskCreatePinnedToCore(usb_client_task, "deq_usb_client", USB_HOST_TASK_STACK_BYTES,
                                       NULL, 3, &client_task_handle, 0);
    if (created != pdTRUE) {
        return ESP_FAIL;
    }
    return ESP_OK;
}

bool deq_usb_client_is_connected(void)
{
    xSemaphoreTake(s_connection_state_mutex, portMAX_DELAY);
    bool connected = s_client.connected;
    xSemaphoreGive(s_connection_state_mutex);
    return connected;
}

bool deq_usb_client_send(const uint8_t *data, size_t length)
{
    usb_transfer_t *out_transfer;
    if (usb_host_transfer_alloc(length, 0, &out_transfer) != ESP_OK) {
        return false;
    }
    memcpy(out_transfer->data_buffer, data, length);
    out_transfer->num_bytes = length;
    out_transfer->callback = out_transfer_cb;
    out_transfer->context = NULL;

    // Held across the submit itself, not just the field reads: close_device()
    // holds this same lock across freeing dev_hdl, so this either submits
    // against a handle that is still guaranteed open, or (if a disconnect
    // got the lock first) sees connected==false and never touches the
    // freed handle at all. usb_host_transfer_submit() only queues the
    // transfer -- it does not block on the USB link itself -- so holding
    // the lock here is brief.
    xSemaphoreTake(s_connection_state_mutex, portMAX_DELAY);
    bool submitted = false;
    if (s_client.connected) {
        out_transfer->device_handle = s_client.dev_hdl;
        out_transfer->bEndpointAddress = s_client.out_endpoint_address;
        submitted = (usb_host_transfer_submit(out_transfer) == ESP_OK);
    }
    xSemaphoreGive(s_connection_state_mutex);

    if (!submitted) {
        usb_host_transfer_free(out_transfer);
    }
    return submitted;
}

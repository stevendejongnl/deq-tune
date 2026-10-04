idf_component_register(SRCS "bridge_main.c" "deq_usb_client.c"
                    INCLUDE_DIRS "."
                    PRIV_REQUIRES usb esp_driver_uart
                    )

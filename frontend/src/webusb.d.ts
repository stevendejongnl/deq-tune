// Minimal WebUSB typings — TS's default DOM lib doesn't ship these yet.
// Only what connect-device.ts actually uses.

interface USBDevice {
  productName?: string;
  serialNumber?: string;
}

interface USBDeviceFilter {
  vendorId?: number;
  productId?: number;
}

interface USBDeviceRequestOptions {
  filters: USBDeviceFilter[];
}

interface USB {
  requestDevice(options: USBDeviceRequestOptions): Promise<USBDevice>;
}

interface Navigator {
  readonly usb: USB;
}

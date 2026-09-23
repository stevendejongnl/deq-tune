export interface FakeUsb extends USB {
  requests: USBDeviceRequestOptions[];
}

/** A `navigator.usb`-shaped fixture: records requests, answers with `respond`. */
export function createFakeUsb(respond: () => Promise<USBDevice>): FakeUsb {
  const requests: USBDeviceRequestOptions[] = [];
  return {
    requests,
    requestDevice(options: USBDeviceRequestOptions) {
      requests.push(options);
      return respond();
    },
  };
}

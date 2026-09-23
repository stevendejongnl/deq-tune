import { describe, expect, it } from "vitest";
import "./connect-device.ts";
import type { ConnectDevice } from "./connect-device.ts";
import { createFakeUsb } from "./testing/fake-usb.ts";
import { flushMicrotasks } from "../testing/flush-microtasks.ts";

async function mount(usb: USB | undefined): Promise<ConnectDevice> {
  const element = document.createElement("connect-device") as ConnectDevice;
  element.usb = usb;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

async function clickConnect(element: ConnectDevice): Promise<void> {
  element.shadowRoot!.querySelector("button")!.dispatchEvent(new Event("click"));
  await flushMicrotasks();
  await element.updateComplete;
}

describe("connect-device", () => {
  it("shows an unsupported hint when no USB provider is given", async () => {
    const element = await mount(undefined);

    expect(element.shadowRoot!.textContent).toContain("Chrome or Edge");
    expect(element.shadowRoot!.querySelector("button")).toBeNull();
  });

  it("requests a Pioneer-vendor device and reports the connected device on success", async () => {
    const usb = createFakeUsb(async () => ({ productName: "DEQ-1000A-MZ" }));
    const element = await mount(usb);

    let detail: { device: USBDevice } | undefined;
    element.addEventListener("device-connected", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    await clickConnect(element);

    expect(usb.requests).toEqual([{ filters: [{ vendorId: 0x08e4 }] }]);
    expect(element.shadowRoot!.textContent).toContain("DEQ-1000A-MZ");
    expect(detail?.device.productName).toBe("DEQ-1000A-MZ");
  });

  it("shows an error and stays connectable when pairing fails", async () => {
    const usb = createFakeUsb(() => Promise.reject(new Error("No device selected.")));
    const element = await mount(usb);

    await clickConnect(element);

    expect(element.shadowRoot!.textContent).toContain("No device selected.");
    expect(element.shadowRoot!.querySelector("button")).not.toBeNull();
  });

  it("translates the connect button for the given locale", async () => {
    const usb = createFakeUsb(async () => ({ productName: "DEQ-1000A-MZ" }));
    const element = await mount(usb);
    element.locale = "fr";
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector("button")!.textContent).toContain("Connecter");
  });
});

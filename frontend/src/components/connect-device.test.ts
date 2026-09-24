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
  element.shadowRoot!.querySelector(".connect")!.dispatchEvent(new Event("click"));
  await flushMicrotasks();
  await element.updateComplete;
}

/** The browser throws this when the user closes the device picker. */
function pickerCancelled(): Error {
  const caughtError = new Error("No device selected.");
  caughtError.name = "NotFoundError";
  return caughtError;
}

describe("connect-device", () => {
  it("shows an unsupported hint when no USB provider is given", async () => {
    const element = await mount(undefined);

    expect(element.shadowRoot!.textContent).toContain("Chrome or Edge");
    expect(element.shadowRoot!.querySelector(".connect")).toBeNull();
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

  it("reports a cancelled picker as a friendly problem", async () => {
    const usb = createFakeUsb(() => Promise.reject(pickerCancelled()));
    const element = await mount(usb);
    let detail: { problem: { title: string; body: string } | null } | undefined;
    element.addEventListener("connect-problem", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    await clickConnect(element);

    expect(detail?.problem?.title).toBe("No DEQ picked");
    expect(detail?.problem?.body).toContain("Plug the DEQ into this computer over USB");
    expect(detail?.problem?.body).not.toContain("No device selected.");
  });

  it("says USB-C and tap on a touch layout", async () => {
    const usb = createFakeUsb(() => Promise.reject(pickerCancelled()));
    const element = await mount(usb);
    element.layout = "phone";
    await element.updateComplete;
    let detail: { problem: { body: string } | null } | undefined;
    element.addEventListener("connect-problem", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    await clickConnect(element);

    expect(detail?.problem?.body).toContain("USB-C");
    expect(detail?.problem?.body).toContain("tap Connect");
  });

  it("keeps the message of any other failure", async () => {
    const usb = createFakeUsb(() => Promise.reject(new Error("Device is busy.")));
    const element = await mount(usb);
    let detail: { problem: { body: string } | null } | undefined;
    element.addEventListener("connect-problem", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    await clickConnect(element);

    expect(detail?.problem?.body).toContain("Device is busy.");
  });

  it("stays connectable after a failure", async () => {
    const usb = createFakeUsb(() => Promise.reject(pickerCancelled()));
    const element = await mount(usb);

    await clickConnect(element);

    expect(element.shadowRoot!.querySelector(".connect")).not.toBeNull();
  });

  it("shows the offline status before a device is paired", async () => {
    const usb = createFakeUsb(async () => ({ productName: "DEQ-1000A-MZ" }));
    const element = await mount(usb);

    expect(element.shadowRoot!.querySelector(".pill")!.textContent).toContain("DEQ not connected");
    expect(element.shadowRoot!.querySelector(".pill")!.classList.contains("connected")).toBe(false);
  });

  it("translates the connect button for the given locale", async () => {
    const usb = createFakeUsb(async () => ({ productName: "DEQ-1000A-MZ" }));
    const element = await mount(usb);
    element.locale = "fr";
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector(".connect")!.textContent).toContain("Connecter");
  });
});

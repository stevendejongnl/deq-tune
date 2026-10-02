import { beforeEach, describe, expect, it } from "vitest";
import "./device-status.ts";
import type { DeviceStatus } from "./device-status.ts";
import { FakeDeviceApi } from "./testing/fake-device-api.ts";

async function mount(api: FakeDeviceApi, layout = "desktop"): Promise<DeviceStatus> {
  const element = document.createElement("device-status");
  element.api = api;
  element.layout = layout as DeviceStatus["layout"];
  document.body.append(element);
  await element.updateComplete;
  // The first read of the unit happens on connect, so settle that too.
  await element.updateComplete;
  return element;
}

function textOf(element: DeviceStatus): string {
  return element.shadowRoot!.textContent!.replace(/\s+/g, " ").trim();
}

function connectButton(element: DeviceStatus): HTMLButtonElement {
  return element.shadowRoot!.querySelector<HTMLButtonElement>("button.connect")!;
}

describe("device-status", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("starts on not connected, and offers a connect button", async () => {
    const element = await mount(new FakeDeviceApi());

    expect(textOf(element)).toContain("DEQ not connected");
    expect(connectButton(element)).not.toBeNull();
  });

  it("shows the unit's firmware version once it is connected", async () => {
    const element = await mount(new FakeDeviceApi());

    connectButton(element).click();
    await element.updateComplete;
    await element.updateComplete;

    expect(textOf(element)).toContain("DEQ connected");
    expect(textOf(element)).toContain("2.02");
  });

  it("drops the connect button once the unit is connected", async () => {
    const element = await mount(new FakeDeviceApi());

    connectButton(element).click();
    await element.updateComplete;
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector("button.connect")).toBeNull();
  });

  it("marks the pill as connected, so the dot changes colour", async () => {
    const element = await mount(new FakeDeviceApi());
    expect(element.shadowRoot!.querySelector(".pill.connected")).toBeNull();

    connectButton(element).click();
    await element.updateComplete;
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector(".pill.connected")).not.toBeNull();
  });

  it("emits device-connected with what the unit reported", async () => {
    const element = await mount(new FakeDeviceApi());
    const events: CustomEvent[] = [];
    element.addEventListener("device-connected", (event) => events.push(event as CustomEvent));

    connectButton(element).click();
    await element.updateComplete;
    await element.updateComplete;

    expect(events).toHaveLength(1);
    expect(events[0].detail.device.serial).toBe("ABIV002781EW");
  });

  it("reports the backend's own reason when the link fails", async () => {
    const api = new FakeDeviceApi();
    api.refuses = "no reply to command 0x02 within 5.0 seconds";
    const element = await mount(api);
    const problems: CustomEvent[] = [];
    element.addEventListener("connect-problem", (event) => problems.push(event as CustomEvent));

    connectButton(element).click();
    await element.updateComplete;
    await element.updateComplete;

    const reported = problems.filter((event) => event.detail.problem !== null);
    expect(reported).toHaveLength(1);
    expect(reported[0].detail.problem.body).toContain("no reply to command 0x02");
    expect(textOf(element)).toContain("DEQ not connected");
  });

  it("clears an earlier problem when the user tries again", async () => {
    const element = await mount(new FakeDeviceApi());
    const problems: CustomEvent[] = [];
    element.addEventListener("connect-problem", (event) => problems.push(event as CustomEvent));

    connectButton(element).click();
    await element.updateComplete;

    expect(problems[0].detail.problem).toBeNull();
  });

  it("keeps the status text off the phone header until a unit is connected", async () => {
    const element = await mount(new FakeDeviceApi(), "phone");

    expect(textOf(element)).not.toContain("DEQ not connected");

    connectButton(element).click();
    await element.updateComplete;
    await element.updateComplete;

    expect(textOf(element)).toContain("DEQ connected");
  });

  it("renders without an api, so the header never breaks", async () => {
    const element = document.createElement("device-status");
    document.body.append(element);
    await element.updateComplete;

    expect(textOf(element)).toContain("DEQ not connected");
  });

  it("shows the label in the chosen locale", async () => {
    const element = await mount(new FakeDeviceApi());
    element.locale = "nl";
    await element.updateComplete;

    expect(textOf(element)).toContain("DEQ niet verbonden");
  });
});

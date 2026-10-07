import { beforeEach, describe, expect, it } from "vitest";
import "./bridge-notices.ts";
import { BRIDGE_POLL_MS, type BridgeNotices } from "./bridge-notices.ts";
import { FakeBridgeApi } from "./testing/fake-bridge-api.ts";

/** Holds the next scheduled read instead of running it. */
class ManualSchedule {
  gaps: number[] = [];
  private pending: (() => void) | null = null;

  schedule = (action: () => void, delayMs: number): unknown => {
    this.gaps.push(delayMs);
    this.pending = action;
    return this.gaps.length;
  };

  cancel = (): void => {
    this.pending = null;
  };

  get isScheduled(): boolean {
    return this.pending !== null;
  }

  fire(): void {
    const action = this.pending;
    this.pending = null;
    action?.();
  }
}

async function mount(
  api: FakeBridgeApi,
  schedule: ManualSchedule = new ManualSchedule(),
): Promise<BridgeNotices> {
  const element = document.createElement("bridge-notices") as BridgeNotices;
  element.api = api;
  element.scheduleFunction = schedule.schedule;
  element.cancelFunction = schedule.cancel;
  document.body.append(element);
  await element.updateComplete;
  await element.updateComplete;
  return element;
}

function textOf(element: BridgeNotices): string {
  return element.shadowRoot!.querySelector(".notices")?.textContent?.trim() ?? "";
}

describe("bridge-notices", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("shows nothing at all while the bridge is well", async () => {
    const element = await mount(new FakeBridgeApi());

    expect(element.shadowRoot!.querySelector(".notices")).toBeNull();
  });

  it("shows a warning the bridge has raised", async () => {
    const element = await mount(
      new FakeBridgeApi().raiseNotice({ message: "The bridge has had a power dip." }),
    );

    expect(textOf(element)).toContain("power dip");
  });

  it("keeps showing a warning after the fault passes", async () => {
    // The reason the notice exists. The live reading recovers and the
    // warning stays, because it explains what already went wrong.
    const api = new FakeBridgeApi().raiseNotice();
    const schedule = new ManualSchedule();
    const element = await mount(api, schedule);

    api.recover();
    schedule.fire();
    await element.updateComplete;
    await element.updateComplete;

    expect(element.warnings).toHaveLength(1);
  });

  it("counts a fault that keeps happening", async () => {
    const element = await mount(new FakeBridgeApi().raiseNotice({ count: 4 }));

    expect(element.shadowRoot!.querySelector(".count")!.textContent).toContain("4");
  });

  it("leaves out the count when it happened once", async () => {
    // Assert on the count element, not the text: the dismiss button is
    // itself a "×", so the rendered text always holds one.
    const element = await mount(new FakeBridgeApi().raiseNotice({ count: 1 }));

    expect(element.shadowRoot!.querySelector(".count")).toBeNull();
  });

  it("ignores a notice that is not a warning", async () => {
    const element = await mount(
      new FakeBridgeApi().raiseNotice({ severity: "info" }),
    );

    expect(element.shadowRoot!.querySelector(".notices")).toBeNull();
  });

  it("can be dismissed, and then stays gone", async () => {
    const element = await mount(new FakeBridgeApi().raiseNotice());

    element.shadowRoot!.querySelector<HTMLButtonElement>(".dismiss")!.click();
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector(".notices")).toBeNull();
  });

  it("keeps the notices it has when the bridge goes out of reach", async () => {
    // The device pill already reports an unreachable bridge, so this
    // stays quiet rather than saying it twice, and does not throw away
    // what it knows.
    const api = new FakeBridgeApi().raiseNotice();
    const schedule = new ManualSchedule();
    const element = await mount(api, schedule);

    api.unreachable = true;
    schedule.fire();
    await element.updateComplete;

    expect(element.warnings).toHaveLength(1);
  });

  it("asks again on a timer", async () => {
    const api = new FakeBridgeApi();
    const schedule = new ManualSchedule();
    await mount(api, schedule);

    expect(schedule.gaps).toEqual([BRIDGE_POLL_MS]);
    expect(api.readCount).toBe(1);

    schedule.fire();

    expect(api.readCount).toBe(2);
  });

  it("stops asking once it leaves the page", async () => {
    const schedule = new ManualSchedule();
    const element = await mount(new FakeBridgeApi(), schedule);

    element.remove();

    expect(schedule.isScheduled).toBe(false);
  });
});

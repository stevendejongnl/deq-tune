import { describe, expect, it } from "vitest";
import "./eq-editor.ts";
import type { EqEditor } from "./eq-editor.ts";
import { EQ_BAND_FREQUENCIES } from "../eq-bands.ts";
import type { AppLayout } from "../layout-query.ts";

const FLAT = new Array(13).fill(0);

async function mount(
  gains: number[],
  factoryGains: number[] = [],
  layout: AppLayout = "desktop",
): Promise<EqEditor> {
  const element = document.createElement("eq-editor") as EqEditor;
  element.gains = gains;
  element.factoryGains = factoryGains;
  element.layout = layout;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function queryBandButtons(element: EqEditor): NodeListOf<HTMLButtonElement> {
  return element.shadowRoot!.querySelectorAll(".band-hit");
}

async function click(element: EqEditor, button: HTMLElement): Promise<void> {
  button.dispatchEvent(new Event("click"));
  await element.updateComplete;
}

describe("eq-editor", () => {
  it("draws one hit target per EQ band", async () => {
    const element = await mount([...FLAT]);
    expect(queryBandButtons(element)).toHaveLength(EQ_BAND_FREQUENCIES.length);
  });

  it("draws your curve and the factory curve when factory gains are given", async () => {
    const element = await mount([...FLAT], [...FLAT]);
    expect(element.shadowRoot!.querySelector(".curve")).not.toBeNull();
    expect(element.shadowRoot!.querySelector(".factory-curve")).not.toBeNull();
  });

  it("draws no factory curve when no factory gains are given", async () => {
    const element = await mount([...FLAT]);
    expect(element.shadowRoot!.querySelector(".factory-curve")).toBeNull();
  });

  it("starts on the highest band", async () => {
    const element = await mount([...FLAT]);
    const selected = element.shadowRoot!.querySelector('.band-hit[aria-pressed="true"]');
    expect(selected!.getAttribute("aria-label")).toContain("12.5 kHz");
  });

  it("names each band with its frequency and its gain", async () => {
    const element = await mount([3.5, ...new Array(12).fill(0)]);
    expect(queryBandButtons(element)[0].getAttribute("aria-label")).toBe("50 Hz, +3.5 dB");
  });

  it("emits gain-change with the clamped value from the stepper", async () => {
    const element = await mount([...FLAT]);
    let detail: { band: number; value: number } | undefined;
    element.addEventListener("gain-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const raise = element.shadowRoot!.querySelectorAll(".step")[1] as HTMLButtonElement;
    await click(element, raise);

    expect(detail).toEqual({ band: 12, value: 0.5 });
  });

  it("emits gain-change from the range input", async () => {
    const element = await mount([...FLAT]);
    let detail: { band: number; value: number } | undefined;
    element.addEventListener("gain-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const slider = element.shadowRoot!.querySelector('input[type="range"]') as HTMLInputElement;
    slider.value = "6";
    slider.dispatchEvent(new Event("input"));

    expect(detail).toEqual({ band: 12, value: 6 });
  });

  it("selects the first band of a zone when its zone button is pressed", async () => {
    const element = await mount([...FLAT]);

    const zones = element.shadowRoot!.querySelectorAll(".zone");
    await click(element, zones[0] as HTMLElement);

    const selected = element.shadowRoot!.querySelector('.band-hit[aria-pressed="true"]');
    expect(selected!.getAttribute("aria-label")).toContain("50 Hz");
  });

  it("moves the selection with the left and right keys", async () => {
    const element = await mount([...FLAT]);

    const bands = queryBandButtons(element);
    bands[12].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
    await element.updateComplete;

    const selected = element.shadowRoot!.querySelector('.band-hit[aria-pressed="true"]');
    expect(selected!.getAttribute("aria-label")).toContain("8 kHz");
  });

  it("changes the gain with the up and down keys", async () => {
    const element = await mount([...FLAT]);
    let detail: { band: number; value: number } | undefined;
    element.addEventListener("gain-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    queryBandButtons(element)[12].dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp" }));

    expect(detail).toEqual({ band: 12, value: 0.5 });
  });

  it("offers a reset for a band that differs from factory", async () => {
    const gains = [...FLAT];
    gains[12] = 6;
    const element = await mount(gains, [...FLAT]);
    let detail: { band: number; value: number } | undefined;
    element.addEventListener("gain-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const reset = element.shadowRoot!.querySelector(".reset-band") as HTMLButtonElement;
    await click(element, reset);

    expect(detail).toEqual({ band: 12, value: 0 });
  });

  it("hides the reset when the band matches factory", async () => {
    const element = await mount([...FLAT], [...FLAT]);
    expect(element.shadowRoot!.querySelector(".reset-band")).toBeNull();
  });

  it("changes the gain while a dot is dragged", async () => {
    const element = await mount([...FLAT], [...FLAT]);
    const gains: number[] = [];
    element.addEventListener("gain-change", (rawEvent) => {
      gains.push((rawEvent as CustomEvent).detail.value);
    });

    const dot = queryBandButtons(element)[6];
    dot.setPointerCapture = () => {};
    dot.hasPointerCapture = () => false;
    dot.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, bubbles: true }));
    // The chart is 300 tall with 24 padding, so its top edge is +12 dB.
    dot.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientY: 24, bubbles: true }));
    dot.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, bubbles: true }));
    await element.updateComplete;

    expect(gains.length).toBeGreaterThan(0);
    expect(gains[gains.length - 1]).toBe(12);
  });

  it("ignores pointer moves when no dot is held", async () => {
    const element = await mount([...FLAT], [...FLAT]);
    let changes = 0;
    element.addEventListener("gain-change", () => (changes += 1));

    queryBandButtons(element)[6].dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 1, clientY: 24, bubbles: true }),
    );

    expect(changes).toBe(0);
  });

  it("shows band chips instead of zones in the phone layout", async () => {
    const element = await mount([...FLAT], [...FLAT], "phone");

    expect(element.shadowRoot!.querySelectorAll(".chip")).toHaveLength(
      EQ_BAND_FREQUENCIES.length,
    );
    expect(element.shadowRoot!.querySelector(".zone")).toBeNull();
    expect(element.shadowRoot!.querySelector(".band-hit")).toBeNull();
  });

  it("selects a band from its phone chip", async () => {
    const element = await mount([...FLAT], [...FLAT], "phone");

    const chips = element.shadowRoot!.querySelectorAll(".chip");
    await click(element, chips[3] as HTMLElement);

    expect(chips[3].getAttribute("aria-pressed")).toBe("true");
  });
});

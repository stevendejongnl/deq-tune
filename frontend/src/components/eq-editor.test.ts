import { describe, expect, it } from "vitest";
import "./eq-editor.ts";
import type { EqEditor } from "./eq-editor.ts";
import { EQ_BAND_FREQUENCIES } from "../eq-bands.ts";

async function mount(gains: number[]) {
  const element = document.createElement("eq-editor") as EqEditor;
  element.gains = gains;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe("eq-editor", () => {
  it("renders one slider per EQ band", async () => {
    const element = await mount(new Array(13).fill(0));
    const sliders = element.shadowRoot!.querySelectorAll('input[type="range"]');
    expect(sliders).toHaveLength(EQ_BAND_FREQUENCIES.length);
  });

  it("emits gain-change with the band index and new value on input", async () => {
    const element = await mount(new Array(13).fill(0));
    const slider = element.shadowRoot!.querySelectorAll('input[type="range"]')[3] as HTMLInputElement;

    let detail: { band: number; value: number } | undefined;
    element.addEventListener("gain-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    slider.value = "6";
    slider.dispatchEvent(new Event("input"));

    expect(detail).toEqual({ band: 3, value: 6 });
  });

  it("clamps the displayed value format to one decimal", async () => {
    const element = await mount([1.25, ...new Array(12).fill(0)]);
    const firstValue = element.shadowRoot!.querySelector(".value")!.textContent;
    expect(firstValue).toBe("1.3");
  });
});

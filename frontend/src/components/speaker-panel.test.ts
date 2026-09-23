import { describe, expect, it } from "vitest";
import "./speaker-panel.ts";
import type { SpeakerPanel } from "./speaker-panel.ts";
import type { Speaker } from "../dto/profile.dto.ts";

const speakers: Record<string, Speaker> = {
  FL: { isPositivePhase: true, levelDB: 1, timeAlignmentCm: 115, levelDBExtended: 0 },
  FR: { isPositivePhase: false, levelDB: 0, timeAlignmentCm: 85, levelDBExtended: 0 },
};

async function mount() {
  const element = document.createElement("speaker-panel") as SpeakerPanel;
  element.speakers = speakers;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe("speaker-panel", () => {
  it("renders one row per speaker channel", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelectorAll("tbody tr")).toHaveLength(2);
  });

  it("emits speaker-change with channel/field/value on level edit", async () => {
    const element = await mount();
    let detail: unknown;
    element.addEventListener(
      "speaker-change",
      (rawEvent) => (detail = (rawEvent as CustomEvent).detail),
    );

    const levelInput = element.shadowRoot!.querySelector(
      'tbody tr input[type="number"]',
    ) as HTMLInputElement;
    levelInput.value = "2.5";
    levelInput.dispatchEvent(new Event("change"));

    expect(detail).toEqual({ channel: "FL", field: "levelDB", value: 2.5 });
  });

  it("toggles phase on button click", async () => {
    const element = await mount();
    let detail: unknown;
    element.addEventListener(
      "speaker-change",
      (rawEvent) => (detail = (rawEvent as CustomEvent).detail),
    );

    const phaseButton = element.shadowRoot!.querySelector("tbody tr button") as HTMLButtonElement;
    phaseButton.click();

    expect(detail).toEqual({ channel: "FL", field: "isPositivePhase", value: false });
  });

  it("translates column headers and channel labels for the given locale", async () => {
    const element = await mount();
    element.locale = "de";
    await element.updateComplete;

    expect(element.shadowRoot!.textContent).toContain("Pegel (dB)");
    expect(element.shadowRoot!.textContent).toContain("Vorne links");
  });
});

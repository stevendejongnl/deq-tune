import { describe, expect, it } from "vitest";
import "./speaker-panel.ts";
import type { SpeakerPanel } from "./speaker-panel.ts";
import type { Speaker } from "../dto/profile.dto.ts";
import type { AppLayout } from "../layout-query.ts";

const speakers: Record<string, Speaker> = {
  FL: { isPositivePhase: true, levelDB: 1, timeAlignmentCm: 130, levelDBExtended: 0 },
  FR: { isPositivePhase: false, levelDB: 0, timeAlignmentCm: 95, levelDBExtended: 0 },
  RL: { isPositivePhase: true, levelDB: -2, timeAlignmentCm: 117.5, levelDBExtended: 0 },
  RR: { isPositivePhase: true, levelDB: -2, timeAlignmentCm: 67.5, levelDBExtended: 0 },
};

async function mount(layout: AppLayout = "desktop"): Promise<SpeakerPanel> {
  const element = document.createElement("speaker-panel") as SpeakerPanel;
  element.speakers = speakers;
  element.layout = layout;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function querySpeakerButtons(element: SpeakerPanel): NodeListOf<HTMLButtonElement> {
  return element.shadowRoot!.querySelectorAll(".speaker");
}

async function click(element: SpeakerPanel, button: HTMLElement): Promise<void> {
  button.dispatchEvent(new Event("click"));
  await element.updateComplete;
}

function listen(element: SpeakerPanel): { detail: unknown } {
  const captured: { detail: unknown } = { detail: undefined };
  element.addEventListener("speaker-change", (rawEvent) => {
    captured.detail = (rawEvent as CustomEvent).detail;
  });
  return captured;
}

describe("speaker-panel", () => {
  it("draws one button per speaker channel", async () => {
    const element = await mount();
    expect(querySpeakerButtons(element)).toHaveLength(4);
  });

  it("shows each delay as a pill in centimetres", async () => {
    const element = await mount();
    const pills = [...element.shadowRoot!.querySelectorAll(".delay-pill")].map(
      (pill) => pill.textContent?.trim(),
    );
    expect(pills).toEqual(["130 cm", "95 cm", "117.5 cm", "67.5 cm"]);
  });

  it("shows the delay in centimetres and milliseconds in the editor", async () => {
    const element = await mount();
    const value = element.shadowRoot!.querySelector(".delay-value")!.textContent!;
    expect(value).toContain("130 cm");
    expect(value).toContain("3.79 ms");
  });

  it("starts on the front left speaker", async () => {
    const element = await mount();
    expect(querySpeakerButtons(element)[0].getAttribute("aria-pressed")).toBe("true");
    expect(element.shadowRoot!.querySelector(".editor-title")!.textContent!.trim()).toBe(
      "Front Left",
    );
  });

  it("selects another speaker when its button is pressed", async () => {
    const element = await mount();

    await click(element, querySpeakerButtons(element)[3]);

    expect(element.shadowRoot!.querySelector(".editor-title")!.textContent!.trim()).toBe(
      "Rear Right",
    );
  });

  it("emits a level change in steps of 0.5 dB", async () => {
    const element = await mount();
    const captured = listen(element);

    const raiseLevel = element.shadowRoot!.querySelectorAll(".step")[1] as HTMLButtonElement;
    await click(element, raiseLevel);

    expect(captured.detail).toEqual({ channel: "FL", field: "levelDB", value: 1.5 });
  });

  it("emits a delay change in steps of 0.5 cm", async () => {
    const element = await mount();
    const captured = listen(element);

    const shorterDelay = element.shadowRoot!.querySelectorAll(".step")[2] as HTMLButtonElement;
    await click(element, shorterDelay);

    expect(captured.detail).toEqual({ channel: "FL", field: "timeAlignmentCm", value: 129.5 });
  });

  it("never lets a delay go below zero", async () => {
    const element = document.createElement("speaker-panel") as SpeakerPanel;
    element.speakers = {
      FL: { isPositivePhase: true, levelDB: 0, timeAlignmentCm: 0, levelDBExtended: 0 },
    };
    document.body.append(element);
    await element.updateComplete;
    const captured = listen(element);

    const shorterDelay = element.shadowRoot!.querySelectorAll(".step")[2] as HTMLButtonElement;
    await click(element, shorterDelay);

    expect(captured.detail).toEqual({ channel: "FL", field: "timeAlignmentCm", value: 0 });
  });

  it("emits the phase from the segmented control", async () => {
    const element = await mount();
    const captured = listen(element);

    const inverted = element.shadowRoot!.querySelectorAll(".segment")[1] as HTMLButtonElement;
    await click(element, inverted);

    expect(captured.detail).toEqual({ channel: "FL", field: "isPositivePhase", value: false });
  });

  it("marks the phase of the selected speaker", async () => {
    const element = await mount();
    await click(element, querySpeakerButtons(element)[1]);

    const segments = element.shadowRoot!.querySelectorAll(".segment");
    expect(segments[0].getAttribute("aria-pressed")).toBe("false");
    expect(segments[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("sizes a speaker button from its level", async () => {
    const element = await mount();
    const buttons = querySpeakerButtons(element);
    expect(buttons[0].style.width).toBe("42px");
    expect(buttons[3].style.width).toBe("36px");
  });

  it("keeps speaker buttons at 44 px on touch layouts", async () => {
    const element = await mount("phone");
    expect(querySpeakerButtons(element)[3].style.width).toBe("44px");
  });
});

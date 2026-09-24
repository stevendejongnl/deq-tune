import { describe, expect, it } from "vitest";
import "./dsp-panel.ts";
import type { DspPanel } from "./dsp-panel.ts";
import { EQ_STYLE_IDS, LIVE_SIMULATION_IDS } from "../i18n/dsp-presets.ts";

async function mount(): Promise<DspPanel> {
  const element = document.createElement("dsp-panel") as DspPanel;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe("dsp-panel", () => {
  it("renders one tile per EQ style", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelectorAll(".tile")).toHaveLength(EQ_STYLE_IDS.length);
  });

  it("renders one option per Live Simulation preset", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelectorAll(".option")).toHaveLength(
      LIVE_SIMULATION_IDS.length,
    );
  });

  it("marks the current eqStyle tile as pressed", async () => {
    const element = await mount();
    element.eqStyle = "powerful";
    await element.updateComplete;

    const pressedTile = element.shadowRoot!.querySelector('.tile[aria-pressed="true"]');
    expect(pressedTile?.textContent?.trim()).toBe("Powerful");
  });

  it("emits eq-style-change with the clicked tile's id", async () => {
    const element = await mount();
    let detail: { id: string } | undefined;
    element.addEventListener("eq-style-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const superBassTile = [...element.shadowRoot!.querySelectorAll(".tile")].find(
      (tile) => tile.textContent?.trim() === "Super Bass",
    ) as HTMLButtonElement;
    superBassTile.click();

    expect(detail).toEqual({ id: "super_bass" });
  });

  it("emits live-simulation-change with the clicked option's id", async () => {
    const element = await mount();
    let detail: { id: string } | undefined;
    element.addEventListener("live-simulation-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const clubOption = [...element.shadowRoot!.querySelectorAll(".option")].find(
      (option) => option.textContent?.trim() === "Club",
    ) as HTMLButtonElement;
    clubOption.click();

    expect(detail).toEqual({ id: "club" });
  });

  it("emits applause-change from the switch", async () => {
    const element = await mount();
    let detail: { enabled: boolean } | undefined;
    element.addEventListener("applause-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const applauseSwitch = element.shadowRoot!.querySelector(".applause") as HTMLButtonElement;
    applauseSwitch.click();

    expect(detail).toEqual({ enabled: true });
  });

  it("marks the applause switch as pressed when it is on", async () => {
    const element = await mount();
    element.applause = true;
    await element.updateComplete;

    const applauseSwitch = element.shadowRoot!.querySelector(".applause")!;
    expect(applauseSwitch.getAttribute("aria-pressed")).toBe("true");
  });

  it("shows the lock note instead of a footer hint", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelector(".lock-note")!.textContent).toContain(
      "Applies once the DEQ is connected",
    );
  });

  it("translates tile and option names for the given locale", async () => {
    const element = await mount();
    element.locale = "de";
    await element.updateComplete;

    expect(element.shadowRoot!.textContent).toContain("KRAFTVOLL");
    expect(element.shadowRoot!.textContent).toContain("Konzerthalle");
  });
});

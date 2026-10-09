import { describe, expect, it } from "vitest";
import "./dsp-panel.ts";
import type { DspPanel } from "./dsp-panel.ts";
import {
  EQ_STYLE_IDS,
  LIVE_SIMULATION_IDS,
  eqStyleHasNoPioneerTranslation,
  liveSimulationHasNoPioneerTranslation,
} from "../i18n/dsp-presets.ts";

const SHOWN_EQ_STYLE_IDS = EQ_STYLE_IDS.filter((id) => !eqStyleHasNoPioneerTranslation(id));
const SHOWN_LIVE_SIMULATION_IDS = LIVE_SIMULATION_IDS.filter(
  (id) => !liveSimulationHasNoPioneerTranslation(id),
);

async function mount(): Promise<DspPanel> {
  const element = document.createElement("dsp-panel") as DspPanel;
  element.eqStyleIds = EQ_STYLE_IDS;
  element.liveSimulationIds = LIVE_SIMULATION_IDS;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe("dsp-panel", () => {
  it("renders one tile per EQ style the real app shows", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelectorAll(".tile")).toHaveLength(SHOWN_EQ_STYLE_IDS.length);
  });

  it("renders one option per Live Simulation mode the real app shows", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelectorAll(".option")).toHaveLength(
      SHOWN_LIVE_SIMULATION_IDS.length,
    );
  });

  it("leaves out the styles Pioneer never shipped a label for", async () => {
    // The DEQ's enum carries members with no label in the app's own
    // resources, and the real app drops them. Showing one here meant a
    // tile named by this project, for a style no Pioneer app selects.
    const element = await mount();
    const labels = [...element.shadowRoot!.querySelectorAll(".tile")].map(
      (tile) => tile.textContent?.trim() ?? "",
    );

    expect(labels).not.toContain("Ultra Bass");
    expect(labels).not.toContain("True Acoustic");
    expect(labels).not.toContain("EDM Beast");
    expect(labels).toContain("Super Bass");
  });

  it("leaves out the live simulation modes Pioneer never shipped a label for", async () => {
    const element = await mount();
    const labels = [...element.shadowRoot!.querySelectorAll(".option")].map(
      (option) => option.textContent?.trim() ?? "",
    );

    expect(labels).not.toContain("Opera Hall");
    expect(labels).not.toContain("DJ Dance Party");
    expect(labels).toContain("Concert hall");
  });

  it("renders no control with an empty label", async () => {
    // A tile with no text is what an unlabelled enum member looked like
    // on screen, and clicking it would have written its wire value.
    const element = await mount();
    const controls = [...element.shadowRoot!.querySelectorAll(".tile, .option")];

    expect(controls).not.toHaveLength(0);
    for (const control of controls) {
      expect(control.textContent?.trim()).not.toBe("");
    }
  });

  it("renders nothing until the unit's own value sets arrive", async () => {
    const element = document.createElement("dsp-panel") as DspPanel;
    document.body.append(element);
    await element.updateComplete;

    expect(element.shadowRoot!.querySelectorAll(".tile")).toHaveLength(0);
    expect(element.shadowRoot!.querySelectorAll(".option")).toHaveLength(0);
  });

  it("marks the current eqStyle tile as pressed", async () => {
    const element = await mount();
    element.eqStyle = "POWERFUL";
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

    expect(detail).toEqual({ id: "SUPER_BASS" });
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

    expect(detail).toEqual({ id: "CLUB" });
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

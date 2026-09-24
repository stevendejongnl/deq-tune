import { describe, expect, it } from "vitest";
import { eqStyleName, liveSimulationName } from "./dsp-presets.ts";

describe("eqStyleName", () => {
  it("returns the English name", () => {
    expect(eqStyleName("en", "super_bass")).toBe("Super Bass");
  });

  it("returns the German name", () => {
    expect(eqStyleName("de", "powerful")).toBe("KRAFTVOLL");
  });
});

describe("liveSimulationName", () => {
  it("returns the English name", () => {
    expect(liveSimulationName("en", "concert_hall")).toBe("Concert hall");
  });

  it("returns the Japanese name", () => {
    expect(liveSimulationName("ja", "club")).toBe("ライブハウス");
  });
});

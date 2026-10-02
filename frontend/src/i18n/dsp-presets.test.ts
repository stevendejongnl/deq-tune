import { describe, expect, it } from "vitest";
import { eqStyleName, liveSimulationName } from "./dsp-presets.ts";
import type { Locale } from "./locale.ts";

/** A locale the APK has no DSP preset names for. The cast is what a new
 * locale looks like before someone reads those names out of the APK. */
const LOCALE_WITHOUT_APK_NAMES = "pt" as Locale;

describe("eqStyleName", () => {
  it("returns the English name", () => {
    expect(eqStyleName("en", "super_bass")).toBe("Super Bass");
  });

  it("returns the German name", () => {
    expect(eqStyleName("de", "powerful")).toBe("KRAFTVOLL");
  });

  it("returns the English name for a locale the APK has no names for", () => {
    expect(eqStyleName(LOCALE_WITHOUT_APK_NAMES, "powerful")).toBe("Powerful");
  });
});

describe("liveSimulationName", () => {
  it("returns the English name", () => {
    expect(liveSimulationName("en", "concert_hall")).toBe("Concert hall");
  });

  it("returns the Japanese name", () => {
    expect(liveSimulationName("ja", "club")).toBe("ライブハウス");
  });

  it("returns the English name for a locale the APK has no names for", () => {
    expect(liveSimulationName(LOCALE_WITHOUT_APK_NAMES, "concert_hall")).toBe("Concert hall");
  });
});

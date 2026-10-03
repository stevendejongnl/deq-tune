import { describe, expect, it } from "vitest";
import {
  eqStyleHasNoPioneerTranslation,
  eqStyleName,
  liveSimulationHasNoPioneerTranslation,
  liveSimulationName,
} from "./dsp-presets.ts";
import type { Locale } from "./locale.ts";

/** A locale the APK has no DSP preset names for. The cast is what a new
 * locale looks like before someone reads those names out of the APK. */
const LOCALE_WITHOUT_APK_NAMES = "pt" as Locale;

describe("eqStyleName", () => {
  it("returns the English name", () => {
    expect(eqStyleName("en", "SUPER_BASS")).toBe("Super Bass");
  });

  it("returns the German name", () => {
    expect(eqStyleName("de", "POWERFUL")).toBe("KRAFTVOLL");
  });

  it("returns the English name for a locale the APK has no names for", () => {
    expect(eqStyleName(LOCALE_WITHOUT_APK_NAMES, "POWERFUL")).toBe("Powerful");
  });

  it("returns a fallback name for an id with no Pioneer translation in any locale", () => {
    expect(eqStyleName("en", "ULTRA_BASS")).toBe("Ultra Bass");
    expect(eqStyleName("ja", "ULTRA_BASS")).toBe("Ultra Bass");
  });
});

describe("liveSimulationName", () => {
  it("returns the English name", () => {
    expect(liveSimulationName("en", "CONCERT_HALL")).toBe("Concert hall");
  });

  it("returns the Japanese name", () => {
    expect(liveSimulationName("ja", "CLUB")).toBe("ライブハウス");
  });

  it("returns the English name for a locale the APK has no names for", () => {
    expect(liveSimulationName(LOCALE_WITHOUT_APK_NAMES, "CONCERT_HALL")).toBe("Concert hall");
  });

  it("returns a fallback name for an id with no Pioneer translation in any locale", () => {
    expect(liveSimulationName("en", "OPERA_HALL")).toBe("Opera Hall");
    expect(liveSimulationName("ja", "OPERA_HALL")).toBe("Opera Hall");
  });
});

describe("eqStyleHasNoPioneerTranslation", () => {
  it("is true for the newer, unlocalized ids", () => {
    expect(eqStyleHasNoPioneerTranslation("ULTRA_BASS")).toBe(true);
    expect(eqStyleHasNoPioneerTranslation("TRUE_ACOUSTIC")).toBe(true);
    expect(eqStyleHasNoPioneerTranslation("EDM_BEAST")).toBe(true);
  });

  it("is false for an id the APK names", () => {
    expect(eqStyleHasNoPioneerTranslation("SUPER_BASS")).toBe(false);
  });
});

describe("liveSimulationHasNoPioneerTranslation", () => {
  it("is true for the newer, unlocalized ids", () => {
    expect(liveSimulationHasNoPioneerTranslation("OPERA_HALL")).toBe(true);
    expect(liveSimulationHasNoPioneerTranslation("DJ_DANCE_PARTY")).toBe(true);
  });

  it("is false for an id the APK names", () => {
    expect(liveSimulationHasNoPioneerTranslation("CONCERT_HALL")).toBe(false);
  });
});

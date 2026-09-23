import { describe, expect, it } from "vitest";
import { localizedProfileName } from "./preset-names.ts";
import { sampleProfile } from "../dto/testing/sample-profile.ts";

describe("localizedProfileName", () => {
  it("builds the English model and speaker-type name for a factory profile", () => {
    const profile = sampleProfile({
      source: "factory",
      car_model: "mazda_3",
      speaker_type: "general",
    });

    expect(localizedProfileName(profile, "en")).toBe("Mazda3 — For Normal Speaker");
  });

  it("builds the Japanese domestic model name for a factory profile", () => {
    const profile = sampleProfile({
      source: "factory",
      car_model: "mazda_3",
      speaker_type: "carrozzeria",
    });

    expect(localizedProfileName(profile, "ja")).toBe("AXELA — カロッツェリアスピーカー用");
  });

  it("falls back to English for a locale without distinct preset translations", () => {
    const profile = sampleProfile({
      source: "factory",
      car_model: "mazda_cx5",
      speaker_type: "general",
    });

    expect(localizedProfileName(profile, "de")).toBe("CX-5 — For Normal Speaker");
  });

  it("never translates a custom profile's name", () => {
    const profile = sampleProfile({
      source: "custom",
      name: "My tuned EQ",
      car_model: "mazda_3",
      speaker_type: "general",
    });

    expect(localizedProfileName(profile, "ja")).toBe("My tuned EQ");
  });
});

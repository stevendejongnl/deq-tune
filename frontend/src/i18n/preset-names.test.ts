import { describe, expect, it } from "vitest";
import {
  localizedModelName,
  localizedProfileName,
  localizedSpeakerTypeLabel,
} from "./preset-names.ts";
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

describe("localizedModelName", () => {
  it("gives the localized car model for a factory preset", () => {
    const profile = sampleProfile({
      source: "factory",
      car_model: "mazda_3",
      speaker_type: "general",
    });

    expect(localizedModelName(profile, "en")).toBe("Mazda3");
  });

  it("gives nothing for a custom profile that kept the car model it was copied from", () => {
    // Duplicating a factory preset copies `car_model`, so the tuning
    // keeps the car it suits. The header once showed that model in
    // place of the name, which hid every rename a user made.
    const profile = sampleProfile({
      source: "custom",
      name: "My tune",
      car_model: "mazda_2",
      speaker_type: "carrozzeria",
    });

    expect(localizedModelName(profile, "en")).toBeNull();
  });
});

describe("localizedSpeakerTypeLabel", () => {
  it("gives the localized speaker type for a factory preset", () => {
    const profile = sampleProfile({
      source: "factory",
      car_model: "mazda_3",
      speaker_type: "general",
    });

    expect(localizedSpeakerTypeLabel(profile, "en")).toBe("For Normal Speaker");
  });

  it("gives nothing for a custom profile, so it shows no factory breadcrumb", () => {
    const profile = sampleProfile({
      source: "custom",
      name: "My tune",
      car_model: "mazda_2",
      speaker_type: "carrozzeria",
    });

    expect(localizedSpeakerTypeLabel(profile, "en")).toBeNull();
  });
});

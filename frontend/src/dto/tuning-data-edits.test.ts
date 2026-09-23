import { describe, expect, it } from "vitest";
import { frontGains, withFrontGain, withSpeakerField } from "./tuning-data-edits.ts";
import { sampleTuningData } from "./testing/sample-profile.ts";

describe("withFrontGain", () => {
  it("replaces one band's gain and leaves the others untouched", () => {
    const original = sampleTuningData();

    const updated = withFrontGain(original, 3, 6.5);

    expect(frontGains(updated)[3]).toBe(6.5);
    expect(frontGains(updated).filter((_, index) => index !== 3)).toEqual(
      frontGains(original).filter((_, index) => index !== 3),
    );
  });

  it("does not mutate the original tuning data", () => {
    const original = sampleTuningData();
    withFrontGain(original, 0, 12);

    expect(frontGains(original)[0]).toBe(0);
  });
});

describe("withSpeakerField", () => {
  it("replaces one field on one speaker channel", () => {
    const original = sampleTuningData();

    const updated = withSpeakerField(original, "FL", "levelDB", 2.5);

    expect(updated.speakers.FL.levelDB).toBe(2.5);
    expect(updated.speakers.FR).toEqual(original.speakers.FR);
  });
});

describe("frontGains", () => {
  it("reads the FRONT channel's gain curve", () => {
    const tuningData = sampleTuningData();
    expect(frontGains(tuningData)).toHaveLength(13);
  });
});

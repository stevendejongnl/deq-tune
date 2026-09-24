import { describe, expect, it } from "vitest";
import {
  bandX,
  clampGain,
  formatGain,
  fullFrequencyLabel,
  gainY,
  shortFrequencyLabel,
  smoothCurvePath,
  type ChartBox,
} from "./eq-curve.ts";

const BOX: ChartBox = { width: 640, height: 300, padLeft: 36, padRight: 16, padY: 24 };

describe("clampGain", () => {
  it("snaps to the nearest half decibel", () => {
    expect(clampGain(3.26)).toBe(3.5);
    expect(clampGain(-1.1)).toBe(-1);
  });

  it("keeps the value inside ±12 dB", () => {
    expect(clampGain(20)).toBe(12);
    expect(clampGain(-20)).toBe(-12);
  });
});

describe("formatGain", () => {
  it("uses a real minus sign and a sign for every value", () => {
    expect(formatGain(7.5)).toBe("+7.5");
    expect(formatGain(-4.5)).toBe("−4.5");
    expect(formatGain(0)).toBe("±0.0");
  });
});

describe("frequency labels", () => {
  it("writes hertz below 1 kHz and kilohertz above it", () => {
    expect(shortFrequencyLabel(0)).toBe("50");
    expect(shortFrequencyLabel(7)).toBe("1.25k");
    expect(shortFrequencyLabel(8)).toBe("2k");
    expect(shortFrequencyLabel(9)).toBe("3.15k");
    expect(fullFrequencyLabel(6)).toBe("800 Hz");
    expect(fullFrequencyLabel(7)).toBe("1.25 kHz");
    expect(fullFrequencyLabel(12)).toBe("12.5 kHz");
  });
});

describe("chart axes", () => {
  it("puts the first band at the left padding and the last at the right edge", () => {
    expect(bandX(BOX, 0)).toBeCloseTo(36, 5);
    expect(bandX(BOX, 12)).toBeCloseTo(624, 5);
  });

  it("puts 0 dB in the middle and +12 dB at the top", () => {
    expect(gainY(BOX, 12)).toBeCloseTo(24, 5);
    expect(gainY(BOX, 0)).toBeCloseTo(150, 5);
    expect(gainY(BOX, -12)).toBeCloseTo(276, 5);
  });
});

describe("smoothCurvePath", () => {
  it("starts at the first point and draws one cubic segment per gap", () => {
    const path = smoothCurvePath([
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 0 },
    ]);
    expect(path.startsWith("M0.0,0.0")).toBe(true);
    expect(path.match(/C/g)).toHaveLength(2);
  });

  it("returns an empty path for no points", () => {
    expect(smoothCurvePath([])).toBe("");
  });
});

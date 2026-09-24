import { describe, expect, it } from "vitest";
import { EQ_ZONES, zoneOfBand } from "./eq-zones.ts";

describe("eq zones", () => {
  it("covers all 13 bands with 6 zones", () => {
    expect(EQ_ZONES).toHaveLength(6);
    expect(EQ_ZONES[0].firstBand).toBe(0);
    expect(EQ_ZONES[5].lastBand).toBe(12);
  });

  it("puts the top three bands in the last zone", () => {
    expect(zoneOfBand(10).index).toBe(5);
    expect(zoneOfBand(11).index).toBe(5);
    expect(zoneOfBand(12).index).toBe(5);
  });

  it("pairs every other band into its own zone", () => {
    expect(zoneOfBand(0).index).toBe(0);
    expect(zoneOfBand(1).index).toBe(0);
    expect(zoneOfBand(2).index).toBe(1);
    expect(zoneOfBand(9).index).toBe(4);
  });
});

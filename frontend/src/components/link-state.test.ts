import { describe, expect, it } from "vitest";
import { readLinkState } from "./link-state.ts";

const CONNECTED = {
  connected: true,
  firmware_version: "2.02",
  serial: "ABIV002781EW",
  problem: null,
};

const UNIT_DOWN = {
  connected: false,
  firmware_version: null,
  serial: null,
  problem: "the unit is not connected",
};

describe("readLinkState", () => {
  it("calls a failed request a missing bridge", () => {
    // `null` is what a rejected `fetch` leaves behind, and only an
    // out-of-reach bridge does that.
    expect(readLinkState(null)).toBe("no-bridge");
  });

  it("calls an answered request with no link a unit that is down", () => {
    // The bridge replied, so it is reachable. The unit is not.
    expect(readLinkState(UNIT_DOWN)).toBe("unit-down");
  });

  it("calls an answered request with a link connected", () => {
    expect(readLinkState(CONNECTED)).toBe("connected");
  });
});

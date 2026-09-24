import { describe, expect, it } from "vitest";
import { groupFactoryProfiles } from "./factory-groups.ts";
import { sampleProfile } from "./dto/testing/sample-profile.ts";

const profiles = [
  sampleProfile({ id: 1, car_model: "mazda_2", speaker_type: "carrozzeria" }),
  sampleProfile({ id: 2, car_model: "mazda_2", speaker_type: "general" }),
  sampleProfile({ id: 3, car_model: "mazda_cx5", speaker_type: "carrozzeria" }),
  sampleProfile({ id: 4, name: "My copy", source: "custom", car_model: null }),
];

describe("groupFactoryProfiles", () => {
  it("groups the factory presets by car model", () => {
    const groups = groupFactoryProfiles(profiles, "en", "");

    expect(groups).toHaveLength(2);
    expect(groups[0].modelName).toBe("Mazda2");
    expect(groups[0].profiles.map((profile) => profile.id)).toEqual([1, 2]);
    expect(groups[1].modelName).toBe("CX-5");
  });

  it("leaves custom profiles out", () => {
    const groups = groupFactoryProfiles(profiles, "en", "");
    const ids = groups.flatMap((group) => group.profiles.map((profile) => profile.id));
    expect(ids).not.toContain(4);
  });

  it("filters by the localized model name, ignoring case", () => {
    expect(groupFactoryProfiles(profiles, "en", "cx")).toHaveLength(1);
    expect(groupFactoryProfiles(profiles, "en", "MAZDA2")).toHaveLength(1);
    expect(groupFactoryProfiles(profiles, "en", "audi")).toHaveLength(0);
  });

  it("filters on the Japanese model name in the Japanese locale", () => {
    expect(groupFactoryProfiles(profiles, "ja", "DEMIO")).toHaveLength(1);
  });
});

import { describe, expect, it } from "vitest";
import "./profile-list.ts";
import type { ProfileList } from "./profile-list.ts";
import { sampleProfile } from "../dto/testing/sample-profile.ts";

const profiles = [
  sampleProfile({ id: 1, name: "mazda_3(general)", source: "factory" }),
  sampleProfile({ id: 2, name: "My Custom EQ", source: "custom" }),
];

async function mount() {
  const element = document.createElement("profile-list") as ProfileList;
  element.profiles = profiles;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe("profile-list", () => {
  it("groups profiles into factory and custom sections", async () => {
    const element = await mount();
    const sections = element.shadowRoot!.querySelectorAll("section");
    expect(sections).toHaveLength(2);
    expect(sections[0].querySelectorAll("li")).toHaveLength(1);
    expect(sections[1].querySelectorAll("li")).toHaveLength(1);
  });

  it("only offers Delete for custom profiles", async () => {
    const element = await mount();
    const [customItem, factoryItem] = [...element.shadowRoot!.querySelectorAll("li")];
    expect(customItem.querySelectorAll("button")).toHaveLength(3); // name + duplicate + delete
    expect(factoryItem.querySelectorAll("button")).toHaveLength(2); // name + duplicate
  });

  it("lists custom profiles before factory presets", async () => {
    const element = await mount();
    const sections = [...element.shadowRoot!.querySelectorAll("section h3")].map(
      (heading) => heading.textContent,
    );
    expect(sections).toEqual(["My profiles", "Factory presets"]);
  });

  it("emits select-profile with the profile id on name click", async () => {
    const element = await mount();
    let detail: unknown;
    element.addEventListener(
      "select-profile",
      (rawEvent) => (detail = (rawEvent as CustomEvent).detail),
    );

    (element.shadowRoot!.querySelector(".name") as HTMLButtonElement).click();

    expect(detail).toEqual({ id: 2 });
  });

  it("shows a localized factory-preset name but a custom name as typed", async () => {
    const element = await mount();
    element.locale = "ja";
    await element.updateComplete;

    const names = [...element.shadowRoot!.querySelectorAll(".name")].map(
      (nameElement) => nameElement.textContent,
    );
    expect(names[0]).toBe("My Custom EQ");
    expect(names[1]).toContain("AXELA");
  });
});

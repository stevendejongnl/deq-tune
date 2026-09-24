import { describe, expect, it } from "vitest";
import "./profile-list.ts";
import type { ProfileList } from "./profile-list.ts";
import { sampleProfile } from "../dto/testing/sample-profile.ts";
import type { ProfileDto } from "../dto/profile.dto.ts";

const factoryProfiles = [
  sampleProfile({ id: 1, car_model: "mazda_2", speaker_type: "carrozzeria" }),
  sampleProfile({ id: 2, car_model: "mazda_2", speaker_type: "general" }),
  sampleProfile({ id: 3, car_model: "mazda_cx5", speaker_type: "carrozzeria" }),
  sampleProfile({ id: 4, car_model: "mazda_cx5", speaker_type: "general" }),
];

async function mount(
  profiles: ProfileDto[] = factoryProfiles,
  selectedId: number | null = null,
): Promise<ProfileList> {
  const element = document.createElement("profile-list") as ProfileList;
  element.profiles = profiles;
  element.selectedId = selectedId;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

function queryModelRows(element: ProfileList): NodeListOf<HTMLLIElement> {
  return element.shadowRoot!.querySelectorAll(".model-row");
}

async function type(element: ProfileList, text: string): Promise<void> {
  const input = element.shadowRoot!.querySelector('input[type="search"]') as HTMLInputElement;
  input.value = text;
  input.dispatchEvent(new Event("input"));
  await element.updateComplete;
}

describe("profile-list", () => {
  it("shows one row per car model, not one per preset", async () => {
    const element = await mount();
    expect(queryModelRows(element)).toHaveLength(2);
  });

  it("offers a Pioneer chip and a Stock chip per model", async () => {
    const element = await mount();
    const chips = [...queryModelRows(element)[0].querySelectorAll(".chip")].map(
      (chip) => chip.textContent?.trim(),
    );
    expect(chips).toEqual(["Pioneer", "Stock"]);
  });

  it("emits select-profile with the id behind the pressed chip", async () => {
    const element = await mount();
    let detail: { id: number } | undefined;
    element.addEventListener("select-profile", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const stockChip = queryModelRows(element)[0].querySelectorAll(".chip")[1] as HTMLButtonElement;
    stockChip.click();

    expect(detail).toEqual({ id: 2 });
  });

  it("marks the selected chip and its row", async () => {
    const element = await mount(factoryProfiles, 2);

    const row = queryModelRows(element)[0];
    const chips = row.querySelectorAll(".chip");
    expect(row.classList.contains("selected")).toBe(true);
    expect(chips[0].getAttribute("aria-pressed")).toBe("false");
    expect(chips[1].getAttribute("aria-pressed")).toBe("true");
  });

  it("filters the factory rows by the search text", async () => {
    const element = await mount();

    await type(element, "cx");

    expect(queryModelRows(element)).toHaveLength(1);
    expect(queryModelRows(element)[0].textContent).toContain("CX-5");
  });

  it("shows the empty hint when there are no custom profiles", async () => {
    const element = await mount();
    expect(element.shadowRoot!.querySelector(".empty")!.textContent).toContain("Duplicate");
  });

  it("shows a custom profile with its caption", async () => {
    const element = await mount([
      ...factoryProfiles,
      sampleProfile({ id: 9, name: "My copy", source: "custom" }),
    ]);

    const row = element.shadowRoot!.querySelector(".custom-row")!;
    expect(row.textContent).toContain("My copy");
    expect(row.textContent).toContain("Your copy of the factory preset");
  });

  it("keeps duplicate and delete behind the overflow button", async () => {
    const element = await mount([
      ...factoryProfiles,
      sampleProfile({ id: 9, name: "My copy", source: "custom" }),
    ]);
    expect(element.shadowRoot!.querySelector(".menu")).toBeNull();

    const more = element.shadowRoot!.querySelector(".more") as HTMLButtonElement;
    more.click();
    await element.updateComplete;

    expect(element.shadowRoot!.querySelectorAll(".menu .action")).toHaveLength(2);
  });

  it("emits duplicate-profile and delete-profile from the overflow menu", async () => {
    const element = await mount([
      ...factoryProfiles,
      sampleProfile({ id: 9, name: "My copy", source: "custom" }),
    ]);
    const events: string[] = [];
    element.addEventListener("duplicate-profile", () => events.push("duplicate"));
    element.addEventListener("delete-profile", () => events.push("delete"));

    (element.shadowRoot!.querySelector(".more") as HTMLButtonElement).click();
    await element.updateComplete;
    (element.shadowRoot!.querySelectorAll(".menu .action")[0] as HTMLButtonElement).click();
    await element.updateComplete;

    (element.shadowRoot!.querySelector(".more") as HTMLButtonElement).click();
    await element.updateComplete;
    (element.shadowRoot!.querySelectorAll(".menu .action")[1] as HTMLButtonElement).click();

    expect(events).toEqual(["duplicate", "delete"]);
  });

  it("names the factory group after the brand", async () => {
    const element = await mount();
    const labels = [...element.shadowRoot!.querySelectorAll(".group-label")].map(
      (label) => label.textContent?.replace(/\s+/g, " ").trim(),
    );
    expect(labels[1]).toBe("Factory · Mazda");
  });
});

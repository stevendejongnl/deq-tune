import { describe, expect, it } from "vitest";
import "./app-root.ts";
import type { AppRoot } from "./app-root.ts";
import { FakeProfileApi } from "./testing/fake-profile-api.ts";
import { sampleProfile } from "../dto/testing/sample-profile.ts";
import { flushMicrotasks } from "../testing/flush-microtasks.ts";
import { createFakeLocaleStorage } from "../i18n/testing/fake-locale-storage.ts";
import {
  createFakePhoneLayoutQuery,
  type FakePhoneLayoutQuery,
} from "../testing/fake-phone-layout-query.ts";

async function mount(api: FakeProfileApi, phoneLayout = false): Promise<AppRoot> {
  const element = document.createElement("app-root") as AppRoot;
  element.api = api;
  element.localeStorage = createFakeLocaleStorage({});
  element.browserLanguages = ["en-US"];
  element.phoneLayoutQuery = createFakePhoneLayoutQuery(phoneLayout);
  document.body.append(element);
  await flushMicrotasks();
  await element.updateComplete;
  return element;
}

async function click(button: HTMLButtonElement, element: AppRoot): Promise<void> {
  button.dispatchEvent(new Event("click"));
  await flushMicrotasks();
  await element.updateComplete;
}

function queryProfileListItems(element: AppRoot): NodeListOf<HTMLLIElement> {
  const profileList = element.shadowRoot!.querySelector("profile-list")!;
  return profileList.shadowRoot!.querySelectorAll("li");
}

function queryNameButton(element: AppRoot): HTMLButtonElement {
  return element.shadowRoot!
    .querySelector("profile-list")!
    .shadowRoot!.querySelector(".name") as HTMLButtonElement;
}

function queryDrawer(element: AppRoot): HTMLElement {
  return element.shadowRoot!.querySelector(".drawer") as HTMLElement;
}

function queryProfilesToggle(element: AppRoot): HTMLButtonElement {
  return element.shadowRoot!.querySelector(".profiles-toggle") as HTMLButtonElement;
}

describe("app-root", () => {
  it("loads and lists profiles from the injected api on connect", async () => {
    const api = new FakeProfileApi([
      sampleProfile({ id: 1, name: "Factory preset", source: "factory" }),
    ]);

    const element = await mount(api);

    expect(queryProfileListItems(element)).toHaveLength(1);
  });

  it("shows a prompt to select a profile before one is chosen", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));

    expect(element.shadowRoot!.textContent).toContain("Select a profile");
  });

  it("shows the EQ editor for the selected profile and marks factory presets read-only", async () => {
    const api = new FakeProfileApi([
      sampleProfile({ id: 1, name: "Factory preset", source: "factory" }),
    ]);
    const element = await mount(api);

    await click(queryNameButton(element), element);

    expect(element.shadowRoot!.querySelector("eq-editor")).not.toBeNull();
    expect(element.shadowRoot!.textContent).toContain("duplicate it in the list to edit");
  });

  it("persists a gain change through the api for a custom profile", async () => {
    const api = new FakeProfileApi([sampleProfile({ id: 1, name: "My EQ", source: "custom" })]);
    const element = await mount(api);
    await click(queryNameButton(element), element);

    const eqEditor = element.shadowRoot!.querySelector("eq-editor")!;
    eqEditor.dispatchEvent(new CustomEvent("gain-change", { detail: { band: 2, value: 4.5 } }));
    await flushMicrotasks();
    await element.updateComplete;

    const saved = await api.getProfile(1);
    expect(saved.data.foundationEq.expandEq.FRONT.banks.gain[2]).toBe(4.5);
  });

  it("selects the new copy after duplicating a factory profile", async () => {
    const api = new FakeProfileApi([
      sampleProfile({ id: 1, name: "Factory preset", source: "factory" }),
    ]);
    const element = await mount(api);

    const duplicateButton = element.shadowRoot!
      .querySelector("profile-list")!
      .shadowRoot!.querySelectorAll("li button")[1] as HTMLButtonElement;
    await click(duplicateButton, element);

    expect(queryProfileListItems(element)).toHaveLength(2);
    expect(element.shadowRoot!.textContent).not.toContain("duplicate it in the list to edit");
  });

  it("starts in the browser's detected language when nothing is saved", async () => {
    const element = document.createElement("app-root") as AppRoot;
    element.api = new FakeProfileApi([sampleProfile({ id: 1 })]);
    element.localeStorage = createFakeLocaleStorage({});
    element.browserLanguages = ["ja-JP"];
    element.phoneLayoutQuery = createFakePhoneLayoutQuery(false);
    document.body.append(element);
    await flushMicrotasks();
    await element.updateComplete;

    const profileListText =
      element.shadowRoot!.querySelector("profile-list")!.shadowRoot!.textContent;
    expect(profileListText).toContain("純正プリセット");
  });

  it("switches language via the locale switcher and remembers the choice", async () => {
    const storage = createFakeLocaleStorage({});
    const element = document.createElement("app-root") as AppRoot;
    element.api = new FakeProfileApi([sampleProfile({ id: 1 })]);
    element.localeStorage = storage;
    element.browserLanguages = ["en-US"];
    element.phoneLayoutQuery = createFakePhoneLayoutQuery(false);
    document.body.append(element);
    await flushMicrotasks();
    await element.updateComplete;

    const select = element.shadowRoot!
      .querySelector("locale-switcher")!
      .shadowRoot!.querySelector("select") as HTMLSelectElement;
    select.value = "de";
    select.dispatchEvent(new Event("change"));
    await element.updateComplete;

    const profileListText =
      element.shadowRoot!.querySelector("profile-list")!.shadowRoot!.textContent;
    expect(profileListText).toContain("Werkspresets");
    expect(storage.getItem("deq-tune-locale")).toBe("de");
  });

  it("starts with the profiles drawer closed", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));

    expect(queryDrawer(element).classList.contains("open")).toBe(false);
    expect(element.shadowRoot!.querySelector(".drawer-backdrop")).toBeNull();
  });

  it("opens the profiles drawer from the header toggle", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));

    await click(queryProfilesToggle(element), element);

    expect(queryDrawer(element).classList.contains("open")).toBe(true);
    expect(element.shadowRoot!.querySelector(".drawer-backdrop")).not.toBeNull();
  });

  it("closes the profiles drawer when the backdrop is clicked", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));
    await click(queryProfilesToggle(element), element);

    const backdrop = element.shadowRoot!.querySelector(".drawer-backdrop") as HTMLElement;
    backdrop.dispatchEvent(new Event("click"));
    await flushMicrotasks();
    await element.updateComplete;

    expect(queryDrawer(element).classList.contains("open")).toBe(false);
  });

  it("closes the profiles drawer when Escape is pressed", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));
    await click(queryProfilesToggle(element), element);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await element.updateComplete;

    expect(queryDrawer(element).classList.contains("open")).toBe(false);
  });

  it("shows the brand, the speaker type and the model name above the panels", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));

    await click(queryNameButton(element), element);

    const heading = element.shadowRoot!.querySelector(".heading-row")!;
    expect(heading.textContent).toContain("Mazda");
    expect(heading.textContent).toContain("For Normal Speaker");
    expect(heading.querySelector(".profile-title")!.textContent).toContain("Mazda3");
  });

  it("shows every panel at once outside the phone layout", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));
    await click(queryNameButton(element), element);

    expect(element.shadowRoot!.querySelector(".tab-bar")).toBeNull();
    expect(element.shadowRoot!.querySelector("eq-editor")).not.toBeNull();
    expect(element.shadowRoot!.querySelector("speaker-panel")).not.toBeNull();
    expect(element.shadowRoot!.querySelector("dsp-panel")).not.toBeNull();
  });

  it("renders only the active tab in the phone layout", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]), true);
    await click(queryNameButton(element), element);

    expect(element.shadowRoot!.querySelector(".tab-bar")).not.toBeNull();
    expect(element.shadowRoot!.querySelector("eq-editor")).not.toBeNull();
    expect(element.shadowRoot!.querySelector("speaker-panel")).toBeNull();
    expect(element.shadowRoot!.querySelector("dsp-panel")).toBeNull();
  });

  it("swaps the panel when another phone tab is pressed", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]), true);
    await click(queryNameButton(element), element);

    const speakersTab = element.shadowRoot!.querySelectorAll(".tab")[1] as HTMLButtonElement;
    await click(speakersTab, element);

    expect(speakersTab.getAttribute("aria-pressed")).toBe("true");
    expect(element.shadowRoot!.querySelector("speaker-panel")).not.toBeNull();
    expect(element.shadowRoot!.querySelector("eq-editor")).toBeNull();
  });

  it("moves to the phone layout when the viewport becomes narrow", async () => {
    const phoneLayoutQuery: FakePhoneLayoutQuery = createFakePhoneLayoutQuery(false);
    const element = document.createElement("app-root") as AppRoot;
    element.api = new FakeProfileApi([sampleProfile({ id: 1 })]);
    element.localeStorage = createFakeLocaleStorage({});
    element.browserLanguages = ["en-US"];
    element.phoneLayoutQuery = phoneLayoutQuery;
    document.body.append(element);
    await flushMicrotasks();
    await element.updateComplete;
    expect(element.shadowRoot!.querySelector(".tab-bar")).toBeNull();

    phoneLayoutQuery.setMatches(true);
    await element.updateComplete;

    expect(element.shadowRoot!.querySelector(".tab-bar")).not.toBeNull();
  });

  it("closes the profiles drawer after selecting a profile", async () => {
    const element = await mount(new FakeProfileApi([sampleProfile({ id: 1 })]));
    await click(queryProfilesToggle(element), element);

    await click(queryNameButton(element), element);

    expect(queryDrawer(element).classList.contains("open")).toBe(false);
  });
});

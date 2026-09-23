import { describe, expect, it } from "vitest";
import "./locale-switcher.ts";
import type { LocaleSwitcher } from "./locale-switcher.ts";
import { SUPPORTED_LOCALES } from "../i18n/locale.ts";

async function mount(): Promise<LocaleSwitcher> {
  const element = document.createElement("locale-switcher") as LocaleSwitcher;
  document.body.append(element);
  await element.updateComplete;
  return element;
}

describe("locale-switcher", () => {
  it("lists every supported locale as an option", async () => {
    const element = await mount();
    const options = element.shadowRoot!.querySelectorAll("option");
    expect(options).toHaveLength(SUPPORTED_LOCALES.length);
  });

  it("marks the current locale as selected", async () => {
    const element = await mount();
    element.locale = "de";
    await element.updateComplete;

    const select = element.shadowRoot!.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("de");
  });

  it("emits locale-change with the chosen locale", async () => {
    const element = await mount();
    let detail: { locale: string } | undefined;
    element.addEventListener("locale-change", (rawEvent) => {
      detail = (rawEvent as CustomEvent).detail;
    });

    const select = element.shadowRoot!.querySelector("select") as HTMLSelectElement;
    select.value = "ja";
    select.dispatchEvent(new Event("change"));

    expect(detail).toEqual({ locale: "ja" });
  });
});

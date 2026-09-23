import { describe, expect, it } from "vitest";
import { detectBrowserLocale, resolveInitialLocale, saveLocale } from "./locale.ts";
import { createFakeLocaleStorage } from "./testing/fake-locale-storage.ts";

describe("detectBrowserLocale", () => {
  it("matches the first supported language in the list", () => {
    expect(detectBrowserLocale(["fr-FR", "en-US"])).toBe("fr");
  });

  it("matches on the base language code, ignoring region", () => {
    expect(detectBrowserLocale(["de-CH"])).toBe("de");
  });

  it("falls back to English when nothing matches", () => {
    expect(detectBrowserLocale(["sv-SE", "pl-PL"])).toBe("en");
  });

  it("falls back to English for an empty language list", () => {
    expect(detectBrowserLocale([])).toBe("en");
  });
});

describe("resolveInitialLocale", () => {
  it("uses a previously saved locale over browser detection", () => {
    const storage = createFakeLocaleStorage({ "deq-tune-locale": "ja" });

    expect(resolveInitialLocale(storage, ["de-DE"])).toBe("ja");
  });

  it("detects and persists the browser locale when nothing is saved", () => {
    const storage = createFakeLocaleStorage({});

    expect(resolveInitialLocale(storage, ["es-ES"])).toBe("es");
    expect(storage.getItem("deq-tune-locale")).toBe("es");
  });

  it("ignores a saved value that is no longer a supported locale", () => {
    const storage = createFakeLocaleStorage({ "deq-tune-locale": "zz" });

    expect(resolveInitialLocale(storage, ["en-US"])).toBe("en");
  });
});

describe("saveLocale", () => {
  it("writes the chosen locale to storage", () => {
    const storage = createFakeLocaleStorage({});

    saveLocale(storage, "de");

    expect(storage.getItem("deq-tune-locale")).toBe("de");
  });
});

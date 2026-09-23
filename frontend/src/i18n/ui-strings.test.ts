import { describe, expect, it } from "vitest";
import { uiStrings } from "./ui-strings.ts";

describe("uiStrings", () => {
  it("returns the English strings for the en locale", () => {
    expect(uiStrings("en").connectDevice).toBe("Connect DEQ device");
  });

  it("returns the Japanese strings for the ja locale", () => {
    expect(uiStrings("ja").connectDevice).toBe("DEQデバイスに接続");
  });

  it("returns a distinct dictionary per locale", () => {
    const locales = ["en", "ja", "de", "fr", "es", "nl"] as const;
    const taglines = new Set(locales.map((locale) => uiStrings(locale).tagline));
    expect(taglines.size).toBe(locales.length);
  });
});

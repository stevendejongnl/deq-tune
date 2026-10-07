import { describe, expect, it } from "vitest";
import { SUPPORTED_LOCALES } from "./locale.ts";
import { loadCatalogFiles, placeholdersIn, TEMPLATE_LOCALE } from "./testing/catalog-files.ts";
import { mergeOverEnglish, uiStrings, type UiStrings } from "./ui-strings.ts";

function englishFixture(): UiStrings {
  return { factoryPresets: "Factory presets", rename: "Rename" } as UiStrings;
}

describe("uiStrings", () => {
  it("returns the English strings for the en locale", () => {
    expect(uiStrings("en").deviceConnected).toBe("DEQ connected");
  });

  it("returns the Japanese strings for the ja locale", () => {
    expect(uiStrings("ja").deviceConnected).toBe("DEQ接続済み");
  });
});

describe("mergeOverEnglish", () => {
  it("uses the translated value", () => {
    const merged = mergeOverEnglish(englishFixture(), { rename: "Naam wijzigen" });

    expect(merged.rename).toBe("Naam wijzigen");
  });

  it("falls back to English for a key the translation misses", () => {
    const merged = mergeOverEnglish(englishFixture(), { rename: "Naam wijzigen" });

    expect(merged.factoryPresets).toBe("Factory presets");
  });

  it("falls back to English for a value the translator left empty", () => {
    const merged = mergeOverEnglish(englishFixture(), { rename: "   " });

    expect(merged.rename).toBe("Rename");
  });
});

describe("translation catalogs", () => {
  const catalogs = loadCatalogFiles();
  const template = catalogs.get(TEMPLATE_LOCALE);
  const translations = [...catalogs].filter(([locale]) => locale !== TEMPLATE_LOCALE);

  it("has one file per supported locale, and no other", () => {
    expect([...catalogs.keys()].sort()).toEqual([...SUPPORTED_LOCALES].sort());
  });

  it.each(translations)("%s holds no key the template lacks", (_locale, catalog) => {
    const unknownKeys = Object.keys(catalog).filter((key) => !(key in (template ?? {})));

    expect(unknownKeys).toEqual([]);
  });

  it.each(translations)("%s keeps every placeholder", (_locale, catalog) => {
    const lostPlaceholders: string[] = [];
    for (const [key, englishValue] of Object.entries(template ?? {})) {
      const translatedValue = catalog[key];
      if (typeof englishValue !== "string" || typeof translatedValue !== "string") {
        continue;
      }
      for (const placeholder of placeholdersIn(englishValue)) {
        if (!placeholdersIn(translatedValue).has(placeholder)) {
          lostPlaceholders.push(`${key}: ${placeholder}`);
        }
      }
    }

    expect(lostPlaceholders).toEqual([]);
  });

  it.each([...catalogs])("%s has no blank value", (_locale, catalog) => {
    const blankKeys = Object.entries(catalog)
      .filter(([, value]) => typeof value !== "string" || value.trim() === "")
      .map(([key]) => key);

    expect(blankKeys).toEqual([]);
  });
});

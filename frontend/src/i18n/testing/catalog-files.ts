/** Every catalog file in the repo, keyed by its locale code.
 *
 * The app imports only the catalogs it supports. A test needs to see every
 * file, because Weblate can add one before anyone wires it into the app. */
export function loadCatalogFiles(): Map<string, Record<string, unknown>> {
  const modules = import.meta.glob<Record<string, unknown>>("../locales/*.json", {
    eager: true,
    import: "default",
  });

  const catalogs = new Map<string, Record<string, unknown>>();
  for (const [path, catalog] of Object.entries(modules)) {
    const localeCode = path.replace("../locales/", "").replace(".json", "");
    catalogs.set(localeCode, catalog);
  }
  return catalogs;
}

/** The locale whose file holds the source text every other file translates. */
export const TEMPLATE_LOCALE = "en";

/** Reads the placeholders a value carries, such as `{count}`. A translation
 * must keep every one of them, spelling included. */
export function placeholdersIn(value: string): Set<string> {
  return new Set(value.match(/\{[a-zA-Z]+\}/g) ?? []);
}

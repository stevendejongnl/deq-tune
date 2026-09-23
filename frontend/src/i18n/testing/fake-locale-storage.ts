import type { LocaleStorage } from "../locale.ts";

/** An in-memory LocaleStorage fixture, seeded with `initialValues`. */
export function createFakeLocaleStorage(initialValues: Record<string, string>): LocaleStorage {
  const values = new Map(Object.entries(initialValues));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

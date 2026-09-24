import type { ProfileDto } from "./dto/profile.dto.ts";
import type { Locale } from "./i18n/locale.ts";
import { localizedModelName } from "./i18n/preset-names.ts";

/** One car model, with the factory presets that belong to it. A model
 * normally has two: one per speaker type. */
export interface CarModelGroup {
  carModel: string;
  modelName: string;
  brand: string | null;
  profiles: readonly ProfileDto[];
}

/**
 * Groups the factory presets by car model, in the order the backend
 * sends them. `search` keeps only the models whose localized name
 * contains that text.
 */
export function groupFactoryProfiles(
  profiles: readonly ProfileDto[],
  locale: Locale,
  search: string,
): CarModelGroup[] {
  const groups = new Map<string, CarModelGroup>();
  for (const profile of profiles) {
    if (profile.source !== "factory" || profile.car_model === null) {
      continue;
    }
    const existing = groups.get(profile.car_model);
    if (existing === undefined) {
      groups.set(profile.car_model, {
        carModel: profile.car_model,
        modelName: localizedModelName(profile, locale) ?? profile.car_model,
        brand: profile.brand_name,
        profiles: [profile],
      });
      continue;
    }
    groups.set(profile.car_model, { ...existing, profiles: [...existing.profiles, profile] });
  }

  const wanted = search.trim().toLocaleLowerCase();
  const all = [...groups.values()];
  if (wanted === "") {
    return all;
  }
  return all.filter((group) => group.modelName.toLocaleLowerCase().includes(wanted));
}

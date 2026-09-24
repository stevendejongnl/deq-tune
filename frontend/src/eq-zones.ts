import type { UiStrings } from "./i18n/ui-strings.ts";

/** The six named zones of the frequency axis. Each zone covers two
 * bands, except the last one, which covers the top three. */
export const EQ_ZONE_COUNT = 6;

export interface EqZone {
  index: number;
  firstBand: number;
  lastBand: number;
}

export const EQ_ZONES: readonly EqZone[] = [
  { index: 0, firstBand: 0, lastBand: 1 },
  { index: 1, firstBand: 2, lastBand: 3 },
  { index: 2, firstBand: 4, lastBand: 5 },
  { index: 3, firstBand: 6, lastBand: 7 },
  { index: 4, firstBand: 8, lastBand: 9 },
  { index: 5, firstBand: 10, lastBand: 12 },
];

export function zoneOfBand(band: number): EqZone {
  return EQ_ZONES[Math.min(EQ_ZONE_COUNT - 1, Math.floor(band / 2))];
}

export function zoneName(strings: UiStrings, zone: EqZone): string {
  return strings.zoneNames[zone.index];
}

export function zoneHint(strings: UiStrings, zone: EqZone): string {
  return strings.zoneHints[zone.index];
}

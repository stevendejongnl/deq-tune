import type { Locale } from "./locale.ts";

/**
 * Names for the DEQ device's built-in EQ-style and Live-Simulation DSP
 * presets, copied from the Pioneer app's own string resources (all six
 * locales have real, distinct translations for these — unlike the car
 * tuning-preset names in preset-names.ts).
 *
 * Selecting one of these only takes effect on a connected device — see
 * dsp-panel.ts. There's no local curve data for them to preview; the
 * DSP itself lives in the device's firmware.
 */

export const EQ_STYLE_IDS = [
  "super_bass",
  "powerful",
  "natural",
  "vocal",
  "vivid",
  "dynamic",
  "custom_a",
  "custom_b",
] as const;
export type EqStyleId = (typeof EQ_STYLE_IDS)[number];

export const LIVE_SIMULATION_IDS = ["off", "concert_hall", "open_air", "club", "cafe"] as const;
export type LiveSimulationId = (typeof LIVE_SIMULATION_IDS)[number];

const ENGLISH_EQ_STYLE_NAMES: Record<EqStyleId, string> = {
  super_bass: "Super Bass",
  powerful: "Powerful",
  natural: "Natural",
  vocal: "Vocal",
  vivid: "Vivid",
  dynamic: "Dynamic",
  custom_a: "Custom A",
  custom_b: "Custom B",
};

/**
 * A locale without an entry here shows the English names. Pioneer localized
 * these names itself, so a new locale keeps English until someone reads the
 * real names out of the APK.
 */
const EQ_STYLE_NAMES: Partial<Record<Locale, Record<EqStyleId, string>>> = {
  en: ENGLISH_EQ_STYLE_NAMES,
  ja: {
    super_bass: "SUPER BASS",
    powerful: "POWERFUL",
    natural: "NATURAL",
    vocal: "VOCAL",
    vivid: "Vivid",
    dynamic: "Dynamic",
    custom_a: "カスタム A",
    custom_b: "カスタム B",
  },
  de: {
    super_bass: "SUPERBASS",
    powerful: "KRAFTVOLL",
    natural: "NATÜRLICH",
    vocal: "VOKAL",
    vivid: "Lebhaft",
    dynamic: "Dynamisch",
    custom_a: "Benutzerdefiniert A",
    custom_b: "Benutzerdefiniert B",
  },
  fr: {
    super_bass: "SUPER BASS",
    powerful: "POWERFUL",
    natural: "NATURAL",
    vocal: "VOCAL",
    vivid: "Viv",
    dynamic: "Dynamiq",
    custom_a: "Perso A",
    custom_b: "Perso B",
  },
  es: {
    super_bass: "SUPERGRAV",
    powerful: "POTENTE",
    natural: "NATURAL",
    vocal: "VOCAL",
    vivid: "Vívid",
    dynamic: "Dinám.",
    custom_a: "Person A",
    custom_b: "Person B",
  },
  nl: {
    super_bass: "SUPERBASS",
    powerful: "KRACHTIG",
    natural: "NATUUR",
    vocal: "VOCAAL",
    vivid: "Levendig",
    dynamic: "Dynamisch",
    custom_a: "Aangepast A",
    custom_b: "Aangepast B",
  },
};

const ENGLISH_LIVE_SIMULATION_NAMES: Record<LiveSimulationId, string> = {
  off: "OFF",
  concert_hall: "Concert hall",
  open_air: "Open air",
  club: "Club",
  cafe: "Cafe",
};

const LIVE_SIMULATION_NAMES: Partial<Record<Locale, Record<LiveSimulationId, string>>> = {
  en: ENGLISH_LIVE_SIMULATION_NAMES,
  ja: { off: "OFF", concert_hall: "ドーム", open_air: "野外フェス", club: "ライブハウス", cafe: "ミュージックバー" },
  de: { off: "AUS", concert_hall: "Konzerthalle", open_air: "Freiluft", club: "Club", cafe: "Café" },
  fr: { off: "ARR", concert_hall: "Salle concer", open_air: "Extér", club: "Club", cafe: "Café" },
  es: { off: "OFF", concert_hall: "Sala conc.", open_air: "Aire", club: "Club", cafe: "Café" },
  nl: { off: "UIT", concert_hall: "Concertzaal", open_air: "Openlucht", club: "Club", cafe: "Café" },
};

export function eqStyleName(locale: Locale, id: EqStyleId): string {
  return EQ_STYLE_NAMES[locale]?.[id] ?? ENGLISH_EQ_STYLE_NAMES[id];
}

export function liveSimulationName(locale: Locale, id: LiveSimulationId): string {
  return LIVE_SIMULATION_NAMES[locale]?.[id] ?? ENGLISH_LIVE_SIMULATION_NAMES[id];
}

/**
 * The APK name each of these ids means on the wire.
 *
 * The ids above were chosen before the protocol was decoded. The unit's own
 * value sets live in the Pioneer app, and the backend reads them from there
 * (`backend/app/deq_enums.json`), so this map is what joins the two. The
 * device endpoints take the APK name.
 *
 * `custom_a` and `custom_b` have no entry on purpose. They are not EQ
 * styles: the app's `p$c` enum makes Custom A and B a separate bank axis,
 * and `CUSTOM` is the single style that uses the selected bank.
 */
export const EQ_STYLE_DEVICE_NAMES: Partial<Record<EqStyleId, string>> = {
  super_bass: "SUPER_BASS",
  powerful: "POWERFUL",
  natural: "NATURAL",
  vocal: "VOCAL",
  vivid: "VIVID",
  dynamic: "DYNAMIC",
  custom_a: "CUSTOM",
  custom_b: "CUSTOM",
};

export const LIVE_SIMULATION_DEVICE_NAMES: Record<LiveSimulationId, string> = {
  off: "OFF",
  concert_hall: "CONCERT_HALL",
  open_air: "OPEN_AIR",
  club: "CLUB",
  cafe: "CAFE",
};

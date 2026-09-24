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

const EQ_STYLE_NAMES: Record<Locale, Record<EqStyleId, string>> = {
  en: {
    super_bass: "Super Bass",
    powerful: "Powerful",
    natural: "Natural",
    vocal: "Vocal",
    vivid: "Vivid",
    dynamic: "Dynamic",
    custom_a: "Custom A",
    custom_b: "Custom B",
  },
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

const LIVE_SIMULATION_NAMES: Record<Locale, Record<LiveSimulationId, string>> = {
  en: { off: "OFF", concert_hall: "Concert hall", open_air: "Open air", club: "Club", cafe: "Cafe" },
  ja: { off: "OFF", concert_hall: "ドーム", open_air: "野外フェス", club: "ライブハウス", cafe: "ミュージックバー" },
  de: { off: "AUS", concert_hall: "Konzerthalle", open_air: "Freiluft", club: "Club", cafe: "Café" },
  fr: { off: "ARR", concert_hall: "Salle concer", open_air: "Extér", club: "Club", cafe: "Café" },
  es: { off: "OFF", concert_hall: "Sala conc.", open_air: "Aire", club: "Club", cafe: "Café" },
  nl: { off: "UIT", concert_hall: "Concertzaal", open_air: "Openlucht", club: "Club", cafe: "Café" },
};

export function eqStyleName(locale: Locale, id: EqStyleId): string {
  return EQ_STYLE_NAMES[locale][id];
}

export function liveSimulationName(locale: Locale, id: LiveSimulationId): string {
  return LIVE_SIMULATION_NAMES[locale][id];
}

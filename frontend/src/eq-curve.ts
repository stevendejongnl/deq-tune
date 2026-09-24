import { EQ_BAND_FREQUENCIES } from "./eq-bands.ts";

export const MIN_GAIN_DB = -12;
export const MAX_GAIN_DB = 12;
export const GAIN_STEP_DB = 0.5;

/** The chart box and its padding, in SVG user units. */
export interface ChartBox {
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padY: number;
}

export interface CurvePoint {
  x: number;
  y: number;
}

/** Snaps a gain to the nearest half decibel inside the ±12 dB range. */
export function clampGain(gain: number): number {
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, Math.round(gain * 2) / 2));
}

/** Signed gain text, for example "+7.5", "−4.5" or "±0.0". The minus
 * sign is U+2212, not a hyphen. */
export function formatGain(gain: number): string {
  const sign = gain > 0 ? "+" : gain < 0 ? "−" : "±";
  return sign + Math.abs(gain).toFixed(1);
}

/** The short frequency of a band, for example "800" or "1.25k". */
export function shortFrequencyLabel(band: number): string {
  const frequency = EQ_BAND_FREQUENCIES[band];
  if (frequency < 1000) {
    return String(frequency);
  }
  const kilohertz = frequency / 1000;
  return `${Number.isInteger(kilohertz) ? kilohertz : kilohertz.toFixed(2).replace(/0$/, "")}k`;
}

/** The full frequency of a band, for example "800 Hz" or "1.25 kHz". */
export function fullFrequencyLabel(band: number): string {
  const frequency = EQ_BAND_FREQUENCIES[band];
  if (frequency < 1000) {
    return `${frequency} Hz`;
  }
  const kilohertz = frequency / 1000;
  const text = Number.isInteger(kilohertz) ? String(kilohertz) : kilohertz.toFixed(2).replace(/0$/, "");
  return `${text} kHz`;
}

/** The x of a band. The frequency axis is logarithmic, from 50 Hz to
 * 12.5 kHz, which is a factor of 250. */
export function bandX(box: ChartBox, band: number): number {
  const ratio = Math.log(EQ_BAND_FREQUENCIES[band] / EQ_BAND_FREQUENCIES[0]) / Math.log(250);
  return box.padLeft + ratio * (box.width - box.padLeft - box.padRight);
}

/** The y of a gain. The gain axis runs from +12 dB at the top to
 * −12 dB at the bottom. */
export function gainY(box: ChartBox, gain: number): number {
  return box.padY + ((MAX_GAIN_DB - gain) / (MAX_GAIN_DB - MIN_GAIN_DB)) * (box.height - 2 * box.padY);
}

export function curvePoints(box: ChartBox, gains: readonly number[]): CurvePoint[] {
  return EQ_BAND_FREQUENCIES.map((_frequency, band) => ({
    x: bandX(box, band),
    y: gainY(box, gains[band] ?? 0),
  }));
}

/**
 * A smooth path through every point. It converts a Catmull-Rom spline
 * to cubic Bézier segments with tension 1/6. The first and the last
 * point each stand in for their missing neighbour.
 */
export function smoothCurvePath(points: readonly CurvePoint[]): string {
  if (points.length === 0) {
    return "";
  }
  let path = `M${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let index = 0; index < points.length - 1; index++) {
    const previous = points[index - 1] ?? points[index];
    const start = points[index];
    const end = points[index + 1];
    const next = points[index + 2] ?? end;
    const firstControlX = start.x + (end.x - previous.x) / 6;
    const firstControlY = start.y + (end.y - previous.y) / 6;
    const secondControlX = end.x - (next.x - start.x) / 6;
    const secondControlY = end.y - (next.y - start.y) / 6;
    path +=
      ` C${firstControlX.toFixed(1)},${firstControlY.toFixed(1)}` +
      ` ${secondControlX.toFixed(1)},${secondControlY.toFixed(1)}` +
      ` ${end.x.toFixed(1)},${end.y.toFixed(1)}`;
  }
  return path;
}

/** The curve, closed down to the 0 dB line, for the area fill. */
export function areaPath(box: ChartBox, points: readonly CurvePoint[]): string {
  const zeroY = gainY(box, 0);
  const last = points[points.length - 1];
  return `${smoothCurvePath(points)} L${last.x.toFixed(1)},${zeroY} L${points[0].x.toFixed(1)},${zeroY} Z`;
}

/** The ±6 dB and ±12 dB lines plus one vertical line per band. */
export function gridPath(box: ChartBox): string {
  const right = box.width - box.padRight;
  let path = "";
  for (const gain of [12, 6, -6, -12]) {
    path += `M${box.padLeft},${gainY(box, gain)} H${right} `;
  }
  for (let band = 0; band < EQ_BAND_FREQUENCIES.length; band++) {
    path += `M${bandX(box, band).toFixed(1)},${box.padY} V${box.height - box.padY} `;
  }
  return path;
}

/** The 0 dB line. */
export function zeroLinePath(box: ChartBox): string {
  return `M${box.padLeft},${gainY(box, 0)} H${box.width - box.padRight}`;
}

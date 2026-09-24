import type { Speaker } from "./dto/profile.dto.ts";

export type SpeakerChannel = "FL" | "FR" | "RL" | "RR";

/** The drawing is 300 × 360, copied from the reference design. */
export const CABIN_WIDTH = 300;
export const CABIN_HEIGHT = 360;

export interface SpeakerAnchor {
  channel: SpeakerChannel;
  x: number;
  y: number;
}

export const SPEAKER_ANCHORS: readonly SpeakerAnchor[] = [
  { channel: "FL", x: 40, y: 110 },
  { channel: "FR", x: 260, y: 110 },
  { channel: "RL", x: 40, y: 270 },
  { channel: "RR", x: 260, y: 270 },
];

export const DELAY_PILL_POSITIONS: Record<SpeakerChannel, { x: number; y: number }> = {
  FL: { x: 16, y: 136 },
  FR: { x: 232, y: 136 },
  RL: { x: 16, y: 238 },
  RR: { x: 232, y: 238 },
};

/** The listener sits in a front seat, on the side of the cabin the
 * drawing marks with "You". */
export const LISTENER_LEFT = { x: 104, y: 156 };
export const LISTENER_RIGHT = { x: 196, y: 156 };

/**
 * Which side the listener sits on. The DEQ delays the speakers that
 * are closest, so the side with the longer average delay is the side
 * the listener sits on. The Mazda factory data delays the left
 * speakers most, which puts the listener at the front left.
 */
export function listenerSide(speakers: Record<string, Speaker>): "left" | "right" {
  const average = (channels: SpeakerChannel[]): number => {
    const values = channels
      .map((channel) => speakers[channel]?.timeAlignmentCm)
      .filter((value): value is number => value !== undefined);
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  return average(["FL", "RL"]) >= average(["FR", "RR"]) ? "left" : "right";
}

/** A louder speaker draws a bigger button. Touch layouts keep every
 * button at least 44 px wide. */
export function speakerButtonSize(levelDB: number, isTouchLayout: boolean): number {
  const size = Math.round(40 + levelDB * 2);
  return isTouchLayout ? Math.max(44, size) : size;
}

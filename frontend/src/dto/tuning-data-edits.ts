import type { Speaker, TuningDataDto } from "./profile.dto.ts";

const FRONT_CHANNEL = "FRONT";

/** Returns a copy of `tuningData` with one FRONT-channel gain band changed. */
export function withFrontGain(
  tuningData: TuningDataDto,
  band: number,
  gain: number,
): TuningDataDto {
  const frontBank = tuningData.foundationEq.expandEq[FRONT_CHANNEL];
  const updatedGain = frontBank.banks.gain.map((value, index) => (index === band ? gain : value));

  return {
    ...tuningData,
    foundationEq: {
      ...tuningData.foundationEq,
      expandEq: {
        ...tuningData.foundationEq.expandEq,
        [FRONT_CHANNEL]: {
          ...frontBank,
          banks: { ...frontBank.banks, gain: updatedGain },
        },
      },
    },
  };
}

/** Returns a copy of `tuningData` with one field of one speaker channel changed. */
export function withSpeakerField(
  tuningData: TuningDataDto,
  channel: string,
  field: keyof Speaker,
  value: Speaker[keyof Speaker],
): TuningDataDto {
  const speaker = tuningData.speakers[channel];
  return {
    ...tuningData,
    speakers: {
      ...tuningData.speakers,
      [channel]: { ...speaker, [field]: value },
    },
  };
}

/** Reads the FRONT-channel gain curve, or an all-zero curve if the profile has none. */
export function frontGains(tuningData: TuningDataDto): number[] {
  return tuningData.foundationEq.expandEq[FRONT_CHANNEL]?.banks.gain ?? new Array(13).fill(0);
}

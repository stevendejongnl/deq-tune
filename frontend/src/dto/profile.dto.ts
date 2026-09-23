// Data Transfer Objects for the DEQ backend API.
// Mirrors backend/app/eq_data.py and backend/app/schemas.py — keep in sync.
// Validated at the API boundary with typia (see ../api/client.ts) — do
// not trust a value typed as one of these without going through that
// boundary first.

export interface LRBank {
  isLocked: boolean;
  numOfBand: number;
  selectedBank: number;
  banks: number[][];
}

export interface ChannelBankData {
  q: number[];
  f0: number[];
  gain: number[];
}

export interface ChannelBank {
  isLocked: boolean;
  numOfBand: number;
  selectedBank: number;
  banks: ChannelBankData;
}

export interface FoundationEq {
  isLRMode: boolean;
  eqs: Record<string, LRBank>;
  expandEq: Record<string, ChannelBank>;
}

export interface Speaker {
  isPositivePhase: boolean;
  levelDB: number;
  timeAlignmentCm: number;
  levelDBExtended: number;
}

export interface FilterBand {
  cutoff_hpf: number;
  slope_hpf: number;
}

export interface Filter {
  front: FilterBand;
  rear: FilterBand;
}

export interface CancellingEq {
  L: number[];
  R: number[];
}

export interface CancellingTA {
  L: number;
  R: number;
}

export interface FactoryCancel {
  available: boolean;
  enabled: boolean;
  data: {
    cancellingEQ: CancellingEq;
    cancellingTACm: CancellingTA;
  };
}

export interface FaderBalance {
  fader: number;
  balance: number;
}

export interface TimeAlignment {
  enabled: boolean;
  easySoundFitModeEnabled: boolean;
  easySoundFitMode: number;
}

export interface TuningDataDto {
  foundationEq: FoundationEq;
  speakers: Record<string, Speaker>;
  filter: Filter;
  factoryCancel: FactoryCancel;
  faderBalance: FaderBalance;
  timeAlignment: TimeAlignment;
}

export type ProfileSource = "factory" | "custom";

export interface ProfileDto {
  id: number;
  name: string;
  source: ProfileSource;
  brand_name: string | null;
  car_model: string | null;
  speaker_type: string | null;
  supported_processors: string[];
  data: TuningDataDto;
}

export interface ProfileCreateDto {
  name: string;
  data: TuningDataDto;
  brand_name?: string | null;
  car_model?: string | null;
  speaker_type?: string | null;
  supported_processors?: string[];
}

export interface ProfileUpdateDto {
  name?: string;
  data?: TuningDataDto;
}

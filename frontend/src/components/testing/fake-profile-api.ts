import type { ProfileApi } from "../../api/client.ts";
import type { ProfileCreateDto, ProfileDto, ProfileUpdateDto } from "../../dto/profile.dto.ts";

/** An in-memory ProfileApi fixture: real behavior, no network, no mocking. */
export class FakeProfileApi implements ProfileApi {
  private profiles: ProfileDto[];
  private nextId: number;

  constructor(initialProfiles: ProfileDto[]) {
    this.profiles = initialProfiles;
    this.nextId = Math.max(0, ...initialProfiles.map((profile) => profile.id)) + 1;
  }

  private requireProfile(id: number): ProfileDto {
    const profile = this.profiles.find((candidate) => candidate.id === id);
    if (profile === undefined) {
      throw new Error(`No fake profile with id ${id}`);
    }
    return profile;
  }

  async listProfiles(): Promise<ProfileDto[]> {
    return this.profiles;
  }

  async getProfile(id: number): Promise<ProfileDto> {
    return this.requireProfile(id);
  }

  async createProfile(body: ProfileCreateDto): Promise<ProfileDto> {
    const created: ProfileDto = {
      id: this.nextId++,
      name: body.name,
      source: "custom",
      brand_name: body.brand_name ?? null,
      car_model: body.car_model ?? null,
      speaker_type: body.speaker_type ?? null,
      supported_processors: body.supported_processors ?? [],
      data: body.data,
    };
    this.profiles = [...this.profiles, created];
    return created;
  }

  async updateProfile(id: number, body: ProfileUpdateDto): Promise<ProfileDto> {
    const updated: ProfileDto = { ...this.requireProfile(id), ...body };
    this.profiles = this.profiles.map((profile) => (profile.id === id ? updated : profile));
    return updated;
  }

  async deleteProfile(id: number): Promise<void> {
    this.requireProfile(id);
    this.profiles = this.profiles.filter((profile) => profile.id !== id);
  }

  async duplicateProfile(id: number): Promise<ProfileDto> {
    const source = this.requireProfile(id);
    const copy: ProfileDto = { ...source, id: this.nextId++, name: `${source.name} (copy)`, source: "custom" };
    this.profiles = [...this.profiles, copy];
    return copy;
  }
}

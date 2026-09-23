import typia from "typia";
import type { ProfileCreateDto, ProfileDto, ProfileUpdateDto } from "../dto/profile.dto.ts";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/** A fetch-compatible function. Lets tests inject a fake instead of mocking `fetch`. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

/** Calls the real `fetch` as a method on `window`. A bare reference to
 * `fetch` loses that binding and throws "Illegal invocation" in browsers. */
function windowFetch(url: string, init?: RequestInit): Promise<Response> {
  return window.fetch(url, init);
}

function buildRequestInit(method: string, body?: unknown): RequestInit {
  return {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  };
}

function assertOk(response: Response, method: string, path: string): void {
  if (!response.ok) {
    throw new ApiError(response.status, `${method} ${path} failed: ${response.status}`);
  }
}

async function readJsonBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }
  return response.json();
}

/** What app-root depends on. DeqApiClient implements it against the real
 * backend; tests inject a small hand-written fake instead. */
export interface ProfileApi {
  listProfiles(): Promise<ProfileDto[]>;
  getProfile(id: number): Promise<ProfileDto>;
  createProfile(body: ProfileCreateDto): Promise<ProfileDto>;
  updateProfile(id: number, body: ProfileUpdateDto): Promise<ProfileDto>;
  deleteProfile(id: number): Promise<void>;
  duplicateProfile(id: number): Promise<ProfileDto>;
}

export class DeqApiClient implements ProfileApi {
  private baseUrl: string;
  private fetchImpl: FetchLike;

  constructor(baseUrl: string = "/api", fetchImpl: FetchLike = windowFetch) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
  }

  private async call(method: string, path: string, body?: unknown): Promise<unknown> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, buildRequestInit(method, body));
    assertOk(response, method, path);
    return readJsonBody(response);
  }

  async listProfiles(): Promise<ProfileDto[]> {
    return typia.assert<ProfileDto[]>(await this.call("GET", "/profiles"));
  }

  async getProfile(id: number): Promise<ProfileDto> {
    return typia.assert<ProfileDto>(await this.call("GET", `/profiles/${id}`));
  }

  async createProfile(body: ProfileCreateDto): Promise<ProfileDto> {
    const validBody = typia.assert<ProfileCreateDto>(body);
    return typia.assert<ProfileDto>(await this.call("POST", "/profiles", validBody));
  }

  async updateProfile(id: number, body: ProfileUpdateDto): Promise<ProfileDto> {
    const validBody = typia.assert<ProfileUpdateDto>(body);
    return typia.assert<ProfileDto>(await this.call("PUT", `/profiles/${id}`, validBody));
  }

  async deleteProfile(id: number): Promise<void> {
    await this.call("DELETE", `/profiles/${id}`);
  }

  async duplicateProfile(id: number): Promise<ProfileDto> {
    return typia.assert<ProfileDto>(await this.call("POST", `/profiles/${id}/duplicate`));
  }
}

import type { FetchLike } from "../client.ts";

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

export interface FakeFetch {
  fetch: FetchLike;
  calls: RecordedCall[];
}

/** A fetch fixture for tests: records every call and answers with `respond`. */
export function createFakeFetch(respond: (url: string, init?: RequestInit) => Response): FakeFetch {
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return respond(url, init);
  };
  return { fetch, calls };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

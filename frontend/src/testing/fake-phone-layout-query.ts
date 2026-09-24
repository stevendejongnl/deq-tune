import type { PhoneLayoutQuery } from "../phone-layout-query.ts";

export interface FakePhoneLayoutQuery extends PhoneLayoutQuery {
  /** Reports a new layout width to every subscriber. */
  setMatches(matches: boolean): void;
}

/** An in-memory PhoneLayoutQuery fixture. `initialMatches` decides
 * whether the app starts in the phone layout. */
export function createFakePhoneLayoutQuery(initialMatches: boolean): FakePhoneLayoutQuery {
  let matches = initialMatches;
  const listeners = new Set<(matches: boolean) => void>();
  return {
    matches: () => matches,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    setMatches(next) {
      matches = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
}

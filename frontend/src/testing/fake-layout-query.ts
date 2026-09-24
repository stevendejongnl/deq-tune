import type { AppLayout, LayoutQuery } from "../layout-query.ts";

export interface FakeLayoutQuery extends LayoutQuery {
  /** Reports a new layout to every subscriber. */
  setLayout(layout: AppLayout): void;
}

/** An in-memory LayoutQuery fixture, started at `initialLayout`. */
export function createFakeLayoutQuery(initialLayout: AppLayout): FakeLayoutQuery {
  let layout = initialLayout;
  const listeners = new Set<(layout: AppLayout) => void>();
  return {
    current: () => layout,
    subscribe(onChange) {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    setLayout(next) {
      layout = next;
      for (const listener of listeners) {
        listener(next);
      }
    },
  };
}

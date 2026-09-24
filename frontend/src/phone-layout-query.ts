/** The phone layout starts below the tablet breakpoint. The same width
 * drives `app-root.styles.ts`. Keep the two values equal. */
export const PHONE_LAYOUT_MEDIA_QUERY = "(max-width: 699px)";

/**
 * Tells the app whether the phone layout applies, and calls back when
 * that changes. The phone layout renders one tab at a time, so the app
 * needs this answer in JavaScript and not only in CSS.
 *
 * Call `matches()` to read the current answer. Call `subscribe()` to
 * follow later changes. It depends on `window.matchMedia`.
 */
export interface PhoneLayoutQuery {
  matches(): boolean;
  subscribe(onChange: (matches: boolean) => void): () => void;
}

export const browserPhoneLayoutQuery: PhoneLayoutQuery = {
  matches(): boolean {
    return typeof window === "undefined"
      ? false
      : window.matchMedia(PHONE_LAYOUT_MEDIA_QUERY).matches;
  },
  subscribe(onChange: (matches: boolean) => void): () => void {
    if (typeof window === "undefined") {
      return () => {};
    }
    const mediaQueryList = window.matchMedia(PHONE_LAYOUT_MEDIA_QUERY);
    const listener = (event: MediaQueryListEvent): void => onChange(event.matches);
    mediaQueryList.addEventListener("change", listener);
    return () => mediaQueryList.removeEventListener("change", listener);
  },
};

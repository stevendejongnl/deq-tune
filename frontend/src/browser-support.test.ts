import { describe, expect, it } from "vitest";
import { isBrowserSupported, unsupportedBrowserMessageHtml } from "./browser-support.ts";

describe("isBrowserSupported", () => {
  it("is supported when WebUSB is available", () => {
    expect(isBrowserSupported(true)).toBe(true);
  });

  it("is not supported when WebUSB is unavailable", () => {
    expect(isBrowserSupported(false)).toBe(false);
  });
});

describe("unsupportedBrowserMessageHtml", () => {
  it("names Chrome/Edge as working and Safari/Firefox/iOS as not", () => {
    const html = unsupportedBrowserMessageHtml();
    expect(html).toContain("Chrome");
    expect(html).toContain("Edge");
    expect(html).toContain("Safari");
    expect(html).toContain("iOS");
  });
});

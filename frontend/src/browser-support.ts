/**
 * This app requires WebUSB to talk to the physical DEQ device. WebUSB
 * only ships in Chromium browsers (Chrome, Edge) on desktop and
 * Android — never in Safari or Firefox, and never on iOS (every iOS
 * browser uses WebKit, which does not implement WebUSB). There is no
 * "update your browser" fix for those; only a different browser works.
 */
export function isBrowserSupported(hasWebUsb: boolean): boolean {
  return hasWebUsb;
}

export function unsupportedBrowserMessageHtml(): string {
  return `
    <div class="unsupported-browser">
      <h1>Browser not supported</h1>
      <p>DEQ Tune needs WebUSB to talk to the DEQ device. Your browser does not support it.</p>
      <p><strong>Works in:</strong> Chrome or Edge, on desktop or Android.</p>
      <p><strong>Does not work in:</strong> Safari, Firefox, or any browser on iOS — WebUSB is not available there, and updating will not add it.</p>
    </div>
  `;
}

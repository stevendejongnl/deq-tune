import { isBrowserSupported, unsupportedBrowserMessageHtml } from "./browser-support.ts";

if (isBrowserSupported("usb" in navigator)) {
  import("./components/app-root.ts");
} else {
  document.body.innerHTML = unsupportedBrowserMessageHtml();
}

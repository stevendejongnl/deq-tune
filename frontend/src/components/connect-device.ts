import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Locale } from "../i18n/locale.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import { connectDeviceStyles } from "./connect-device.styles.ts";

/** Pioneer's USB vendor ID, from the Sound Tune app's otg_device_filter.xml. */
const PIONEER_VENDOR_ID = 0x08e4;

type ConnectionState = "idle" | "connecting" | "connected" | "error";

function resolveGlobalUsb(): USB | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.usb;
}

function describeDevice(device: USBDevice): string {
  return device.productName ?? `Pioneer device (${device.serialNumber ?? "unknown serial"})`;
}

function describeConnectError(strings: UiStrings, caughtError: unknown): string {
  return caughtError instanceof Error ? caughtError.message : strings.couldNotConnect;
}

function renderUnsupportedHint(strings: UiStrings): TemplateResult {
  return html`<p class="hint" title=${strings.connectHint}>${strings.usbUnsupported}</p>`;
}

function renderConnected(deviceName: string): TemplateResult {
  return html`<p class="connected"><span class="dot"></span>${deviceName}</p>`;
}

function renderConnectForm(
  strings: UiStrings,
  connecting: boolean,
  error: string,
  onConnect: () => void,
): TemplateResult {
  return html`
    <div class="form">
      <button
        type="button"
        ?disabled=${connecting}
        title=${strings.connectHint}
        @click=${onConnect}
      >
        ${connecting ? strings.connecting : strings.connectDevice}
      </button>
      ${error ? html`<p class="error" role="alert">${error}</p>` : null}
    </div>
  `;
}

/**
 * WebUSB pairing stub for the physical DEQ unit. Proves device
 * selection works via `usb.requestDevice`; does NOT speak the DEQ
 * command protocol yet (that's still native-only in the Android app
 * and needs a USB capture to reverse-engineer). Emits
 * `device-connected` with `{ device }` once paired, so a future
 * protocol layer has a seam to plug into.
 *
 * `usb` defaults to `navigator.usb` but is a settable property so
 * tests can inject a fake instead of stubbing the global.
 */
@customElement("connect-device")
export class ConnectDevice extends LitElement {
  static override styles = connectDeviceStyles;

  @property({ attribute: false }) usb: USB | undefined = resolveGlobalUsb();
  @property({ type: String }) locale: Locale = "en";

  @state() private status: ConnectionState = "idle";
  @state() private deviceName = "";
  @state() private error = "";

  override render() {
    const strings = uiStrings(this.locale);
    if (this.usb === undefined) {
      return renderUnsupportedHint(strings);
    }
    if (this.status === "connected") {
      return renderConnected(this.deviceName);
    }
    return renderConnectForm(strings, this.status === "connecting", this.error, () =>
      this.connect(),
    );
  }

  private async connect() {
    const usb = this.usb;
    if (usb === undefined) {
      return;
    }

    this.status = "connecting";
    this.error = "";
    try {
      const device = await usb.requestDevice({ filters: [{ vendorId: PIONEER_VENDOR_ID }] });
      this.deviceName = describeDevice(device);
      this.status = "connected";
      this.dispatchEvent(new CustomEvent("device-connected", { detail: { device } }));
    } catch (caughtError) {
      this.status = "idle";
      this.error = describeConnectError(uiStrings(this.locale), caughtError);
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "connect-device": ConnectDevice;
  }
}

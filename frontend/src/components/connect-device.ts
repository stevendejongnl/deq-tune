import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Locale } from "../i18n/locale.ts";
import type { AppLayout } from "../layout-query.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import { connectDeviceStyles } from "./connect-device.styles.ts";

/** Pioneer's USB vendor ID, from the Sound Tune app's otg_device_filter.xml. */
const PIONEER_VENDOR_ID = 0x08e4;

type ConnectionState = "idle" | "connecting" | "connected" | "error";

/** What the connect failure means to the user. The browser throws
 * `NotFoundError` when the user closes the device picker without a
 * choice, which is not an error worth raw text. */
export interface ConnectProblem {
  title: string;
  body: string;
}

function resolveGlobalUsb(): USB | undefined {
  return typeof navigator === "undefined" ? undefined : navigator.usb;
}

function describeDevice(device: USBDevice): string {
  return device.productName ?? `Pioneer device (${device.serialNumber ?? "unknown serial"})`;
}

function isPickerCancelled(caughtError: unknown): boolean {
  return caughtError instanceof Error && caughtError.name === "NotFoundError";
}

export function describeConnectProblem(
  strings: UiStrings,
  caughtError: unknown,
  isTouchLayout: boolean,
): ConnectProblem {
  if (isPickerCancelled(caughtError)) {
    return {
      title: strings.noDevicePickedTitle,
      body: isTouchLayout ? strings.noDevicePickedBodyTouch : strings.noDevicePickedBodyDesktop,
    };
  }
  return {
    title: strings.couldNotConnect,
    body: caughtError instanceof Error ? caughtError.message : "",
  };
}

/**
 * WebUSB pairing stub for the physical DEQ unit. It proves the device
 * selection works through `usb.requestDevice`. It does not speak the
 * DEQ command protocol yet.
 *
 * The control is a pill: a status dot, the device text, and the connect
 * button. A failure emits `connect-problem`, and `app-root` places the
 * message where the layout wants it.
 *
 * It emits `device-connected` with `{ device }` once paired. `usb`
 * defaults to `navigator.usb` but is a settable property so tests can
 * inject a fake instead of stubbing the global.
 */
@customElement("connect-device")
export class ConnectDevice extends LitElement {
  static override styles = connectDeviceStyles;

  @property({ attribute: false }) usb: USB | undefined = resolveGlobalUsb();
  @property({ type: String }) locale: Locale = "en";
  @property({ type: String }) layout: AppLayout = "desktop";

  @state() private status: ConnectionState = "idle";
  @state() private deviceName = "";

  private get isTouchLayout(): boolean {
    return this.layout !== "desktop";
  }

  override render() {
    const strings = uiStrings(this.locale);
    if (this.usb === undefined) {
      return html`<p class="hint" title=${strings.connectHint}>${strings.usbUnsupported}</p>`;
    }
    return this.renderPill(strings);
  }

  /** The phone header has room for the dot and the button alone, so it
   * drops the status text until a device is paired. */
  private get showsDeviceLabel(): boolean {
    return this.status === "connected" || this.layout !== "phone";
  }

  private renderPill(strings: UiStrings): TemplateResult {
    const connected = this.status === "connected";
    return html`
      <div class="pill ${connected ? "connected" : ""}">
        <span class="dot"></span>
        ${this.showsDeviceLabel
          ? html`<span class="device-label"
              >${connected ? this.deviceName : strings.deviceNotConnected}</span
            >`
          : nothing}
        ${connected
          ? nothing
          : html`
              <button
                type="button"
                class="connect"
                ?disabled=${this.status === "connecting"}
                title=${strings.connectHint}
                @click=${() => this.connect()}
              >
                ${this.status === "connecting" ? strings.connecting : strings.connectShort}
              </button>
            `}
      </div>
    `;
  }

  private async connect() {
    const usb = this.usb;
    if (usb === undefined) {
      return;
    }

    this.status = "connecting";
    this.dispatchEvent(new CustomEvent("connect-problem", { detail: { problem: null } }));
    try {
      const device = await usb.requestDevice({ filters: [{ vendorId: PIONEER_VENDOR_ID }] });
      this.deviceName = describeDevice(device);
      this.status = "connected";
      this.dispatchEvent(new CustomEvent("device-connected", { detail: { device } }));
    } catch (caughtError) {
      this.status = "idle";
      const problem = describeConnectProblem(
        uiStrings(this.locale),
        caughtError,
        this.isTouchLayout,
      );
      this.dispatchEvent(new CustomEvent("connect-problem", { detail: { problem } }));
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "connect-device": ConnectDevice;
  }
}

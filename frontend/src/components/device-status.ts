import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { DeviceApi } from "../api/client.ts";
import type { DeviceDto } from "../dto/profile.dto.ts";
import type { Locale } from "../i18n/locale.ts";
import type { AppLayout } from "../layout-query.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import { deviceStatusStyles } from "./device-status.styles.ts";

/** What the connect failure means to the user. */
export interface ConnectProblem {
  title: string;
  body: string;
}

export function describeConnectProblem(
  strings: UiStrings,
  problem: string | null,
): ConnectProblem {
  return {
    title: strings.couldNotConnect,
    body: problem ?? strings.deviceUnreachable,
  };
}

/**
 * The header's device pill: a status dot, what the unit is, and a connect
 * button.
 *
 * The backend owns the USB link, so this component only reads and writes
 * the unit's state over the API. It never touches USB itself, which is why
 * the app has no browser requirement.
 *
 * It emits `connect-problem` when the link fails, and `app-root` places the
 * message where the layout wants it. `api` is a settable property so tests
 * pass a hand-written fake instead of stubbing anything.
 */
@customElement("device-status")
export class DeviceStatus extends LitElement {
  static override styles = deviceStatusStyles;

  @property({ attribute: false }) api: DeviceApi | undefined;
  @property({ type: String }) locale: Locale = "en";
  @property({ type: String }) layout: AppLayout = "desktop";

  @state() private device: DeviceDto | null = null;
  @state() private isConnecting = false;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.readDevice();
  }

  private get hasConnectedUnit(): boolean {
    return this.device?.connected === true;
  }

  /** The phone header has room for the dot and the button alone, so it
   * drops the status text until a unit is connected. */
  private get showsDeviceLabel(): boolean {
    return this.hasConnectedUnit || this.layout !== "phone";
  }

  override render() {
    const strings = uiStrings(this.locale);
    return html`
      <div class="pill ${this.hasConnectedUnit ? "connected" : ""}">
        <span class="dot"></span>
        ${this.showsDeviceLabel ? this.renderLabel(strings) : nothing}
        ${this.hasConnectedUnit ? nothing : this.renderConnectButton(strings)}
      </div>
    `;
  }

  private renderLabel(strings: UiStrings): TemplateResult {
    if (!this.hasConnectedUnit) {
      return html`<span class="device-label">${strings.deviceNotConnected}</span>`;
    }
    return html`
      <span class="device-label">${strings.deviceConnected}</span>
      ${this.device?.firmware_version === null
        ? nothing
        : html`<span class="firmware">${this.device?.firmware_version}</span>`}
    `;
  }

  private renderConnectButton(strings: UiStrings): TemplateResult {
    return html`
      <button
        type="button"
        class="connect"
        ?disabled=${this.isConnecting}
        title=${strings.connectHint}
        @click=${() => this.connect()}
      >
        ${this.isConnecting ? strings.connecting : strings.connectShort}
      </button>
    `;
  }

  private async readDevice(): Promise<void> {
    if (this.api === undefined) {
      return;
    }
    try {
      this.device = await this.api.readDevice();
    } catch {
      // A backend that cannot be reached is not worth a message of its
      // own here: the pill stays on "not connected".
      this.device = null;
    }
  }

  private async connect(): Promise<void> {
    if (this.api === undefined) {
      return;
    }
    this.isConnecting = true;
    this.announceProblem(null);
    try {
      const device = await this.api.connectDevice();
      this.device = device;
      if (device.connected) {
        this.dispatchEvent(new CustomEvent("device-connected", { detail: { device } }));
      } else {
        this.announceProblem(
          describeConnectProblem(uiStrings(this.locale), device.problem),
        );
      }
    } catch (caughtError) {
      this.announceProblem(
        describeConnectProblem(
          uiStrings(this.locale),
          caughtError instanceof Error ? caughtError.message : null,
        ),
      );
    } finally {
      this.isConnecting = false;
    }
  }

  private announceProblem(problem: ConnectProblem | null): void {
    this.dispatchEvent(new CustomEvent("connect-problem", { detail: { problem } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "device-status": DeviceStatus;
  }
}

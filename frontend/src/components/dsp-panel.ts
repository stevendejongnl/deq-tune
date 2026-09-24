import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Locale } from "../i18n/locale.ts";
import { dspPanelStyles } from "./dsp-panel.styles.ts";
import {
  EQ_STYLE_IDS,
  LIVE_SIMULATION_IDS,
  type EqStyleId,
  type LiveSimulationId,
  eqStyleName,
  liveSimulationName,
} from "../i18n/dsp-presets.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";

function renderLockIcon(): TemplateResult {
  return html`
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
      <rect x="2" y="5" width="8" height="6" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.2" />
      <path d="M4 5 V3.5 A2 2 0 0 1 8 3.5 V5" fill="none" stroke="currentColor" stroke-width="1.2" />
    </svg>
  `;
}

/**
 * The DEQ device's built-in EQ-style and Live-Simulation DSP presets
 * (Super Bass, Powerful, Concert hall, ...). These run on the device's
 * own firmware. This panel only tracks which one is selected locally.
 * A selection has no effect until the USB command protocol is known
 * (see connect-device.ts).
 *
 * It emits `eq-style-change` ({ id }), `live-simulation-change`
 * ({ id }) and `applause-change` ({ enabled }).
 */
@customElement("dsp-panel")
export class DspPanel extends LitElement {
  static override styles = dspPanelStyles;

  @property({ type: String }) locale: Locale = "en";
  @property({ type: String }) eqStyle: EqStyleId | null = null;
  @property({ type: String }) liveSimulation: LiveSimulationId = "off";
  @property({ type: Boolean }) applause = false;

  override render() {
    const strings = uiStrings(this.locale);
    return html`
      <section class="panel">
        <div class="styles-column">
          <div class="panel-head">
            <h2>
              ${strings.soundStyleTitle}
              <span class="suffix">${strings.soundStyleSuffix}</span>
            </h2>
            <span class="lock-note">${renderLockIcon()}${strings.dspDeviceHint}</span>
          </div>
          <div class="tiles">
            ${EQ_STYLE_IDS.map((id) => this.renderEqStyleTile(id))}
          </div>
        </div>
        <div class="simulation-column">
          <h2>${strings.liveSimulationTitle}</h2>
          <div class="options">
            ${LIVE_SIMULATION_IDS.map((id) => this.renderLiveSimulationOption(id))}
          </div>
          ${this.renderApplauseSwitch(strings)}
        </div>
      </section>
    `;
  }

  private renderEqStyleTile(id: EqStyleId): TemplateResult {
    const selected = id === this.eqStyle;
    return html`
      <button
        type="button"
        class="tile ${selected ? "selected" : ""}"
        aria-pressed=${selected}
        @click=${() => this.dispatchEvent(new CustomEvent("eq-style-change", { detail: { id } }))}
      >
        <span class="radio"></span>${eqStyleName(this.locale, id)}
      </button>
    `;
  }

  private renderLiveSimulationOption(id: LiveSimulationId): TemplateResult {
    const selected = id === this.liveSimulation;
    return html`
      <button
        type="button"
        class="option ${selected ? "selected" : ""}"
        aria-pressed=${selected}
        @click=${() =>
          this.dispatchEvent(new CustomEvent("live-simulation-change", { detail: { id } }))}
      >
        ${liveSimulationName(this.locale, id)}
      </button>
    `;
  }

  private renderApplauseSwitch(strings: UiStrings): TemplateResult {
    return html`
      <button
        type="button"
        class="applause ${this.applause ? "on" : ""}"
        aria-pressed=${this.applause}
        @click=${() =>
          this.dispatchEvent(
            new CustomEvent("applause-change", { detail: { enabled: !this.applause } }),
          )}
      >
        <span class="track"><span class="knob"></span></span>
        ${strings.applauseLabel}
      </button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dsp-panel": DspPanel;
  }
}

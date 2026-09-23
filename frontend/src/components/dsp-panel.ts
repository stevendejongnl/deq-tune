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
import { uiStrings } from "../i18n/ui-strings.ts";

function renderEqStyleTile(
  locale: Locale,
  id: EqStyleId,
  isSelected: boolean,
  onSelect: () => void,
): TemplateResult {
  return html`
    <button
      type="button"
      class="tile"
      aria-pressed=${isSelected ? "true" : "false"}
      @click=${onSelect}
    >
      ${eqStyleName(locale, id)}
    </button>
  `;
}

function renderLiveSimulationOption(
  locale: Locale,
  id: LiveSimulationId,
  isSelected: boolean,
  onSelect: () => void,
): TemplateResult {
  return html`
    <button
      type="button"
      class="option"
      aria-pressed=${isSelected ? "true" : "false"}
      @click=${onSelect}
    >
      ${liveSimulationName(locale, id)}
    </button>
  `;
}

/**
 * The DEQ device's built-in EQ-style and Live-Simulation DSP presets
 * (POWERFUL, SUPER BASS, Concert hall, ...). These run entirely on the
 * device's own firmware — this panel only tracks which one is
 * selected locally; selecting one has no effect until the USB command
 * protocol is reverse-engineered (see connect-device.ts) and wired up
 * here. Emits `eq-style-change` ({ id }), `live-simulation-change`
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
      <section>
        <h3>${strings.eqStyleTitle}</h3>
        <div class="tiles">
          ${EQ_STYLE_IDS.map((id) =>
            renderEqStyleTile(this.locale, id, id === this.eqStyle, () => this.selectEqStyle(id)),
          )}
        </div>
      </section>
      <section>
        <h3>${strings.liveSimulationTitle}</h3>
        <div class="options">
          ${LIVE_SIMULATION_IDS.map((id) =>
            renderLiveSimulationOption(this.locale, id, id === this.liveSimulation, () =>
              this.selectLiveSimulation(id),
            ),
          )}
        </div>
        <label class="applause">
          <input
            type="checkbox"
            .checked=${this.applause}
            @change=${(event: Event) =>
              this.emitApplauseChange((event.target as HTMLInputElement).checked)}
          />
          ${strings.applauseLabel}
        </label>
      </section>
      <p class="hint">${strings.dspDeviceHint}</p>
    `;
  }

  private selectEqStyle(id: EqStyleId): void {
    this.dispatchEvent(new CustomEvent("eq-style-change", { detail: { id } }));
  }

  private selectLiveSimulation(id: LiveSimulationId): void {
    this.dispatchEvent(new CustomEvent("live-simulation-change", { detail: { id } }));
  }

  private emitApplauseChange(enabled: boolean): void {
    this.dispatchEvent(new CustomEvent("applause-change", { detail: { enabled } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dsp-panel": DspPanel;
  }
}

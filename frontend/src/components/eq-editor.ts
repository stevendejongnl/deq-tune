import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { EQ_BAND_FREQUENCIES } from "../eq-bands.ts";
import { eqEditorStyles } from "./eq-editor.styles.ts";

const MIN_GAIN_DB = -12;
const MAX_GAIN_DB = 12;

function formatFrequency(frequencyHz: number): string {
  return frequencyHz >= 1000
    ? `${(frequencyHz / 1000).toFixed(frequencyHz % 1000 === 0 ? 0 : 1)}k`
    : `${frequencyHz}`;
}

/**
 * 13-band graphic EQ editor for one channel. `gains` must have exactly
 * one entry per `EQ_BAND_FREQUENCIES` band; emits `gain-change` with
 * `{ band, value }` detail on every slider move.
 */
@customElement("eq-editor")
export class EqEditor extends LitElement {
  static override styles = eqEditorStyles;

  @property({ type: String }) label = "";
  @property({ type: Array }) gains: number[] = [];

  override render() {
    return html`
      ${this.label ? html`<h3>${this.label}</h3>` : null}
      <div class="bands-scroll">
        <div class="bands">
          ${EQ_BAND_FREQUENCIES.map(
            (frequency, band) => html`
              <div class="band">
                <span class="value">${this.gains[band]?.toFixed(1) ?? "0.0"}</span>
                <input
                  type="range"
                  min=${MIN_GAIN_DB}
                  max=${MAX_GAIN_DB}
                  step="0.5"
                  .value=${String(this.gains[band] ?? 0)}
                  @input=${(event: Event) => this.onBandInput(band, event)}
                />
                <span class="freq">${formatFrequency(frequency)}</span>
              </div>
            `,
          )}
        </div>
      </div>
    `;
  }

  private onBandInput(band: number, event: Event) {
    const value = Number((event.target as HTMLInputElement).value);
    this.dispatchEvent(new CustomEvent("gain-change", { detail: { band, value } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "eq-editor": EqEditor;
  }
}

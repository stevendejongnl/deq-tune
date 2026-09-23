import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { Speaker } from "../dto/profile.dto.ts";
import type { Locale } from "../i18n/locale.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import { speakerPanelStyles } from "./speaker-panel.styles.ts";

function channelLabel(strings: UiStrings, channel: string): string {
  const labels: Record<string, string> = {
    FL: strings.speakerFrontLeft,
    FR: strings.speakerFrontRight,
    RL: strings.speakerRearLeft,
    RR: strings.speakerRearRight,
  };
  return labels[channel] ?? channel;
}

/**
 * Per-speaker level / phase / time-alignment controls. Emits
 * `speaker-change` with `{ channel, field, value }` detail.
 */
@customElement("speaker-panel")
export class SpeakerPanel extends LitElement {
  static override styles = speakerPanelStyles;

  @property({ type: Object }) speakers: Record<string, Speaker> = {};
  @property({ type: String }) locale: Locale = "en";

  override render() {
    const strings = uiStrings(this.locale);
    const channels = Object.keys(this.speakers);
    return html`
      <h3>${strings.speakers}</h3>
      <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>${strings.speakerColumn}</th>
            <th>${strings.levelColumn}</th>
            <th>${strings.timeAlignmentColumn}</th>
            <th>${strings.phaseColumn}</th>
          </tr>
        </thead>
        <tbody>
          ${channels.map((channel) => {
            const speaker = this.speakers[channel];
            return html`
              <tr>
                <td>${channelLabel(strings, channel)}</td>
                <td>
                  <input
                    type="number"
                    step="0.5"
                    .value=${String(speaker.levelDB)}
                    @change=${(event: Event) =>
                      this.emit(
                        channel,
                        "levelDB",
                        Number((event.target as HTMLInputElement).value),
                      )}
                  />
                </td>
                <td>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    .value=${String(speaker.timeAlignmentCm)}
                    @change=${(event: Event) =>
                      this.emit(
                        channel,
                        "timeAlignmentCm",
                        Number((event.target as HTMLInputElement).value),
                      )}
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-pressed=${speaker.isPositivePhase ? "true" : "false"}
                    @click=${() => this.emit(channel, "isPositivePhase", !speaker.isPositivePhase)}
                  >
                    ${speaker.isPositivePhase ? "+" : "-"}
                  </button>
                </td>
              </tr>
            `;
          })}
        </tbody>
      </table>
      </div>
    `;
  }

  private emit(channel: string, field: keyof Speaker, value: number | boolean) {
    this.dispatchEvent(new CustomEvent("speaker-change", { detail: { channel, field, value } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "speaker-panel": SpeakerPanel;
  }
}

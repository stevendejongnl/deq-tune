import { html, LitElement, svg, type SVGTemplateResult, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import type { Speaker } from "../dto/profile.dto.ts";
import type { Locale } from "../i18n/locale.ts";
import type { AppLayout } from "../layout-query.ts";
import { formatGain } from "../eq-curve.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import {
  CABIN_HEIGHT,
  CABIN_WIDTH,
  DELAY_PILL_POSITIONS,
  LISTENER_LEFT,
  LISTENER_RIGHT,
  SPEAKER_ANCHORS,
  listenerSide,
  speakerButtonSize,
  type SpeakerChannel,
} from "../speaker-cabin.ts";
import { speakerPanelStyles } from "./speaker-panel.styles.ts";

const LEVEL_STEP_DB = 0.5;
const MIN_LEVEL_DB = -12;
const MAX_LEVEL_DB = 12;
const DELAY_STEP_CM = 0.5;
/** Sound moves about 34.3 cm every millisecond. */
const CM_PER_MILLISECOND = 34.3;

function channelLabel(strings: UiStrings, channel: string): string {
  const labels: Record<string, string> = {
    FL: strings.speakerFrontLeft,
    FR: strings.speakerFrontRight,
    RL: strings.speakerRearLeft,
    RR: strings.speakerRearRight,
  };
  return labels[channel] ?? channel;
}

function formatDelay(centimetres: number): string {
  return `${centimetres} cm`;
}

function formatMilliseconds(centimetres: number): string {
  return `${(centimetres / CM_PER_MILLISECOND).toFixed(2)} ms`;
}

/** The car body, the windows and the seats. They never change. */
function renderCabinShell(): SVGTemplateResult {
  return svg`
    <rect class="body" x="40" y="6" width="220" height="348" rx="60" />
    <path class="window" d="M62 70 Q150 40 238 70" />
    <path class="window" d="M62 318 Q150 336 238 318" />
    <rect class="seat" x="74" y="122" width="60" height="68" rx="16" />
    <rect class="seat" x="166" y="122" width="60" height="68" rx="16" />
    <rect class="seat" x="74" y="236" width="152" height="62" rx="18" />
  `;
}

/**
 * The cabin seen from above, with one button per speaker, and the
 * editor for the selected speaker.
 *
 * Set `speakers`, `locale` and `layout`. It emits `speaker-change` with
 * `{ channel, field, value }` on every edit.
 */
@customElement("speaker-panel")
export class SpeakerPanel extends LitElement {
  static override styles = speakerPanelStyles;

  @property({ type: Object }) speakers: Record<string, Speaker> = {};
  @property({ type: String }) locale: Locale = "en";
  @property({ type: String }) layout: AppLayout = "desktop";

  @state() private selectedChannel: SpeakerChannel = "FL";

  private get isTouchLayout(): boolean {
    return this.layout !== "desktop";
  }

  private speakerOf(channel: SpeakerChannel): Speaker | undefined {
    return this.speakers[channel];
  }

  private get listenerPoint(): { x: number; y: number } {
    return listenerSide(this.speakers) === "left" ? LISTENER_LEFT : LISTENER_RIGHT;
  }

  override render() {
    const strings = uiStrings(this.locale);
    return html`
      <section class="panel">
        <div class="panel-head">
          <h2>${strings.speakersTitle}</h2>
          <p class="caption">
            ${this.isTouchLayout ? strings.cabinHintTap : strings.cabinHintPick}
          </p>
        </div>
        ${this.renderCabin(strings)} ${this.renderEditor(strings)}
      </section>
    `;
  }

  private renderCabin(strings: UiStrings): TemplateResult {
    const listener = this.listenerPoint;
    return html`
      <div class="cabin" style="width: ${CABIN_WIDTH}px; height: ${CABIN_HEIGHT}px">
        <svg
          width=${CABIN_WIDTH}
          height=${CABIN_HEIGHT}
          viewBox="0 0 ${CABIN_WIDTH} ${CABIN_HEIGHT}"
          aria-hidden="true"
        >
          ${renderCabinShell()}
          <circle class="listener-glow" cx=${listener.x} cy=${listener.y} r="44" />
          ${SPEAKER_ANCHORS.map(
            (anchor) => svg`
              <path
                class="delay-line ${anchor.channel === this.selectedChannel ? "selected" : ""}"
                d="M${anchor.x} ${anchor.y} L${listener.x} ${listener.y}"
              />
            `,
          )}
          <circle class="listener" cx=${listener.x} cy=${listener.y} r="9" />
          <text class="listener-label" x=${listener.x} y=${listener.y + 48} text-anchor="middle">
            ${strings.listenerLabel}
          </text>
        </svg>
        ${SPEAKER_ANCHORS.map((anchor) => this.renderDelayPill(anchor.channel))}
        ${SPEAKER_ANCHORS.map((anchor) => this.renderSpeakerButton(anchor.channel, strings))}
      </div>
    `;
  }

  private renderDelayPill(channel: SpeakerChannel): TemplateResult | typeof html {
    const speaker = this.speakerOf(channel);
    if (speaker === undefined) {
      return html``;
    }
    const position = DELAY_PILL_POSITIONS[channel];
    return html`
      <span class="delay-pill" style="left: ${position.x}px; top: ${position.y}px"
        >${formatDelay(speaker.timeAlignmentCm)}</span
      >
    `;
  }

  private renderSpeakerButton(channel: SpeakerChannel, strings: UiStrings): TemplateResult {
    const speaker = this.speakerOf(channel);
    if (speaker === undefined) {
      return html``;
    }
    const anchor = SPEAKER_ANCHORS.find((candidate) => candidate.channel === channel)!;
    const size = speakerButtonSize(speaker.levelDB, this.isTouchLayout);
    const selected = channel === this.selectedChannel;
    return html`
      <button
        type="button"
        class="speaker ${selected ? "selected" : ""}"
        style="left: ${anchor.x - size / 2}px; top: ${anchor.y - size / 2}px; width: ${size}px; height: ${size}px"
        aria-label=${channelLabel(strings, channel)}
        aria-pressed=${selected}
        @click=${() => (this.selectedChannel = channel)}
      >
        ${channel}
      </button>
    `;
  }

  private renderEditor(strings: UiStrings): TemplateResult {
    const speaker = this.speakerOf(this.selectedChannel);
    if (speaker === undefined) {
      return html``;
    }
    return html`
      <div class="editor">
        <div class="editor-title">${channelLabel(strings, this.selectedChannel)}</div>
        <div class="editor-grid">
          <span class="field-label">${strings.levelLabel}</span>
          ${this.renderStepperRow(
            strings.lowerLevelLabel,
            strings.raiseLevelLabel,
            html`<span class="value level-value">${formatGain(speaker.levelDB)} dB</span>`,
            () => this.changeLevel(speaker.levelDB - LEVEL_STEP_DB),
            () => this.changeLevel(speaker.levelDB + LEVEL_STEP_DB),
          )}
          <span class="field-label">${strings.delayLabel}</span>
          ${this.renderStepperRow(
            strings.shorterDelayLabel,
            strings.longerDelayLabel,
            html`<span class="value delay-value"
              >${formatDelay(speaker.timeAlignmentCm)}
              <span class="milliseconds">· ${formatMilliseconds(speaker.timeAlignmentCm)}</span>
            </span>`,
            () => this.changeDelay(speaker.timeAlignmentCm - DELAY_STEP_CM),
            () => this.changeDelay(speaker.timeAlignmentCm + DELAY_STEP_CM),
          )}
          <span class="field-label">${strings.phaseLabel}</span>
          <div class="segmented">
            <button
              type="button"
              class="segment ${speaker.isPositivePhase ? "selected" : ""}"
              aria-pressed=${speaker.isPositivePhase}
              @click=${() => this.emit("isPositivePhase", true)}
            >
              ${strings.phaseNormal}
            </button>
            <button
              type="button"
              class="segment ${speaker.isPositivePhase ? "" : "selected"}"
              aria-pressed=${!speaker.isPositivePhase}
              @click=${() => this.emit("isPositivePhase", false)}
            >
              ${strings.phaseInverted}
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderStepperRow(
    lowerLabel: string,
    raiseLabel: string,
    value: TemplateResult,
    onLower: () => void,
    onRaise: () => void,
  ): TemplateResult {
    return html`
      <div class="stepper-row">
        <button type="button" class="step" aria-label=${lowerLabel} @click=${onLower}>−</button>
        ${value}
        <button type="button" class="step" aria-label=${raiseLabel} @click=${onRaise}>+</button>
      </div>
    `;
  }

  private changeLevel(levelDB: number): void {
    const snapped = Math.round(levelDB * 2) / 2;
    this.emit("levelDB", Math.max(MIN_LEVEL_DB, Math.min(MAX_LEVEL_DB, snapped)));
  }

  private changeDelay(centimetres: number): void {
    this.emit("timeAlignmentCm", Math.max(0, Math.round(centimetres * 2) / 2));
  }

  private emit(field: keyof Speaker, value: number | boolean): void {
    this.dispatchEvent(
      new CustomEvent("speaker-change", {
        detail: { channel: this.selectedChannel, field, value },
      }),
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "speaker-panel": SpeakerPanel;
  }
}

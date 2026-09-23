import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DeqApiClient, type ProfileApi } from "../api/client.ts";
import type { ProfileDto, Speaker } from "../dto/profile.dto.ts";
import { frontGains, withFrontGain, withSpeakerField } from "../dto/tuning-data-edits.ts";
import { browserLocaleStorage } from "../i18n/browser-locale-storage.ts";
import { type Locale, type LocaleStorage, resolveInitialLocale, saveLocale } from "../i18n/locale.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import type { EqStyleId, LiveSimulationId } from "../i18n/dsp-presets.ts";
import "./profile-list.ts";
import "./eq-editor.ts";
import "./speaker-panel.ts";
import "./connect-device.ts";
import "./locale-switcher.ts";
import "./dsp-panel.ts";
import { appRootStyles } from "./app-root.styles.ts";

function resolveGlobalLanguages(): readonly string[] {
  return typeof navigator === "undefined" ? [] : navigator.languages;
}

function renderNoSelection(strings: UiStrings): TemplateResult {
  return html`<p class="empty">${strings.selectProfilePrompt}</p>`;
}

function renderReadOnlyHint(strings: UiStrings): TemplateResult {
  return html`<p class="hint">${strings.readOnlyHint}</p>`;
}

function renderProfilesToggle(strings: UiStrings, onOpen: () => void): TemplateResult {
  return html`
    <button type="button" class="profiles-toggle" @click=${onOpen}>
      <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
        <path
          d="M3 5.5h14M3 10h14M3 14.5h14"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linecap="round"
        />
      </svg>
      ${strings.profilesButton}
    </button>
  `;
}

/**
 * Top-level page: loads profiles from the backend and wires the
 * profile drawer, EQ editor, speaker panel, USB connect stub, and
 * language switcher together.
 *
 * `api` and `localeStorage` default to real implementations but are
 * settable properties so tests can inject fakes instead of mocking
 * `fetch`/`navigator`/`localStorage`.
 */
@customElement("app-root")
export class AppRoot extends LitElement {
  static override styles = appRootStyles;

  @property({ attribute: false }) api: ProfileApi = new DeqApiClient();
  @property({ attribute: false }) localeStorage: LocaleStorage = browserLocaleStorage;
  @property({ attribute: false }) browserLanguages: readonly string[] = resolveGlobalLanguages();

  @state() private profiles: ProfileDto[] = [];
  @state() private selectedId: number | null = null;
  @state() private locale: Locale = "en";
  @state() private eqStyle: EqStyleId | null = null;
  @state() private liveSimulation: LiveSimulationId = "off";
  @state() private applause = false;
  @state() private profilesDrawerOpen = false;

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.profilesDrawerOpen) {
      this.closeProfilesDrawer();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.locale = resolveInitialLocale(this.localeStorage, this.browserLanguages);
    this.loadProfiles();
    window.addEventListener("keydown", this.onKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKeydown);
  }

  private get selectedProfile(): ProfileDto | undefined {
    return this.profiles.find((profile) => profile.id === this.selectedId);
  }

  override render() {
    const strings = uiStrings(this.locale);
    return html`
      <header>
        <div class="header-start">
          ${renderProfilesToggle(strings, () => this.openProfilesDrawer())}
          <div class="title-group">
            <h1><span class="accent">DEQ</span> Tune</h1>
            <p class="tagline">${strings.tagline}</p>
          </div>
        </div>
        <div class="header-controls">
          <locale-switcher
            .locale=${this.locale}
            @locale-change=${(localeChangeEvent: CustomEvent<{ locale: Locale }>) =>
              this.changeLocale(localeChangeEvent.detail.locale)}
          ></locale-switcher>
          <connect-device .locale=${this.locale}></connect-device>
        </div>
      </header>
      ${this.renderProfilesDrawer(strings)}
      <main>
        <div class="editor">
          <dsp-panel
            .locale=${this.locale}
            .eqStyle=${this.eqStyle}
            .liveSimulation=${this.liveSimulation}
            .applause=${this.applause}
            @eq-style-change=${(eqStyleChangeEvent: CustomEvent<{ id: EqStyleId }>) =>
              (this.eqStyle = eqStyleChangeEvent.detail.id)}
            @live-simulation-change=${(
              liveSimulationChangeEvent: CustomEvent<{ id: LiveSimulationId }>,
            ) => (this.liveSimulation = liveSimulationChangeEvent.detail.id)}
            @applause-change=${(applauseChangeEvent: CustomEvent<{ enabled: boolean }>) =>
              (this.applause = applauseChangeEvent.detail.enabled)}
          ></dsp-panel>
          ${this.renderEditor(strings)}
        </div>
      </main>
    `;
  }

  private renderProfilesDrawer(strings: UiStrings): TemplateResult {
    return html`
      ${this.profilesDrawerOpen
        ? html`<div class="drawer-backdrop" @click=${() => this.closeProfilesDrawer()}></div>`
        : null}
      <aside class="drawer ${this.profilesDrawerOpen ? "open" : ""}">
        <div class="drawer-header">
          <button
            type="button"
            class="drawer-close"
            aria-label=${strings.closeLabel}
            @click=${() => this.closeProfilesDrawer()}
          >
            ×
          </button>
        </div>
        <profile-list
          .profiles=${this.profiles}
          .selectedId=${this.selectedId}
          .locale=${this.locale}
          @select-profile=${(selectEvent: CustomEvent<{ id: number }>) =>
            this.selectProfile(selectEvent.detail.id)}
          @duplicate-profile=${(duplicateEvent: CustomEvent<{ id: number }>) =>
            this.duplicateProfile(duplicateEvent.detail.id)}
          @delete-profile=${(deleteEvent: CustomEvent<{ id: number }>) =>
            this.deleteProfile(deleteEvent.detail.id)}
        ></profile-list>
      </aside>
    `;
  }

  private renderEditor(strings: UiStrings): TemplateResult {
    const profile = this.selectedProfile;
    if (profile === undefined) {
      return renderNoSelection(strings);
    }

    return html`
      <eq-editor
        label=${strings.channelFront}
        .gains=${frontGains(profile.data)}
        @gain-change=${(gainChangeEvent: CustomEvent<{ band: number; value: number }>) =>
          this.changeGain(gainChangeEvent.detail.band, gainChangeEvent.detail.value)}
      ></eq-editor>
      <speaker-panel
        .speakers=${profile.data.speakers}
        .locale=${this.locale}
        @speaker-change=${(
          speakerChangeEvent: CustomEvent<{
            channel: string;
            field: keyof Speaker;
            value: number | boolean;
          }>,
        ) =>
          this.changeSpeaker(
            speakerChangeEvent.detail.channel,
            speakerChangeEvent.detail.field,
            speakerChangeEvent.detail.value,
          )}
      ></speaker-panel>
      ${profile.source === "factory" ? renderReadOnlyHint(strings) : null}
    `;
  }

  private changeLocale(locale: Locale): void {
    this.locale = locale;
    saveLocale(this.localeStorage, locale);
  }

  private openProfilesDrawer(): void {
    this.profilesDrawerOpen = true;
  }

  private closeProfilesDrawer(): void {
    this.profilesDrawerOpen = false;
  }

  private async loadProfiles(): Promise<void> {
    this.profiles = await this.api.listProfiles();
  }

  private selectProfile(id: number): void {
    this.selectedId = id;
    this.closeProfilesDrawer();
  }

  private async duplicateProfile(id: number): Promise<void> {
    const copy = await this.api.duplicateProfile(id);
    await this.loadProfiles();
    this.selectedId = copy.id;
    this.closeProfilesDrawer();
  }

  private async deleteProfile(id: number): Promise<void> {
    await this.api.deleteProfile(id);
    if (this.selectedId === id) {
      this.selectedId = null;
    }
    await this.loadProfiles();
  }

  private async changeGain(band: number, gain: number): Promise<void> {
    const profile = this.selectedProfile;
    if (profile === undefined || profile.source !== "custom") {
      return;
    }
    await this.saveProfileData(profile.id, withFrontGain(profile.data, band, gain));
  }

  private async changeSpeaker(
    channel: string,
    field: keyof Speaker,
    value: number | boolean,
  ): Promise<void> {
    const profile = this.selectedProfile;
    if (profile === undefined || profile.source !== "custom") {
      return;
    }
    await this.saveProfileData(profile.id, withSpeakerField(profile.data, channel, field, value));
  }

  private async saveProfileData(id: number, data: ProfileDto["data"]): Promise<void> {
    const updated = await this.api.updateProfile(id, { data });
    this.profiles = this.profiles.map((profile) => (profile.id === id ? updated : profile));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "app-root": AppRoot;
  }
}

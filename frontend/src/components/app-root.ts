import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DeqApiClient, type ProfileApi } from "../api/client.ts";
import type { ProfileDto, Speaker } from "../dto/profile.dto.ts";
import { frontGains, withFrontGain, withSpeakerField } from "../dto/tuning-data-edits.ts";
import { browserLocaleStorage } from "../i18n/browser-locale-storage.ts";
import { type Locale, type LocaleStorage, resolveInitialLocale, saveLocale } from "../i18n/locale.ts";
import { localizedModelName, localizedSpeakerTypeLabel } from "../i18n/preset-names.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import type { EqStyleId, LiveSimulationId } from "../i18n/dsp-presets.ts";
import { browserPhoneLayoutQuery, type PhoneLayoutQuery } from "../phone-layout-query.ts";
import "./profile-list.ts";
import "./eq-editor.ts";
import "./speaker-panel.ts";
import "./connect-device.ts";
import "./locale-switcher.ts";
import "./dsp-panel.ts";
import { appRootStyles } from "./app-root.styles.ts";

/** The three tabs of the phone layout's bottom tab bar. */
type PhoneTab = "eq" | "speakers" | "style";

function resolveGlobalLanguages(): readonly string[] {
  return typeof navigator === "undefined" ? [] : navigator.languages;
}

function renderNoSelection(strings: UiStrings): TemplateResult {
  return html`<p class="empty">${strings.selectProfilePrompt}</p>`;
}

function renderReadOnlyHint(strings: UiStrings): TemplateResult {
  return html`<p class="hint">${strings.readOnlyHint}</p>`;
}

function renderWordmarkIcon(): TemplateResult {
  return html`
    <svg class="mark" width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect x="1" y="1" width="26" height="26" rx="7" fill="none" stroke="currentColor" stroke-width="1.5" />
      <path
        d="M6 17 L9 12 L12 15 L15 8 L18 16 L22 11"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  `;
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

/** The breadcrumb and the model name above the panels. A custom profile
 * has no car model, so it shows its own name instead. */
function renderHeadingRow(profile: ProfileDto, locale: Locale): TemplateResult {
  const brand = profile.brand_name;
  const speakerType = localizedSpeakerTypeLabel(profile, locale);
  const title = localizedModelName(profile, locale) ?? profile.name;
  return html`
    <div class="heading-row">
      <div class="heading-text">
        ${brand === null || speakerType === null
          ? nothing
          : html`
              <div class="breadcrumb">
                <span>${brand}</span><span aria-hidden="true">/</span><span>${speakerType}</span>
              </div>
            `}
        <h2 class="profile-title">${title}</h2>
      </div>
    </div>
  `;
}

/**
 * Top-level page: loads profiles from the backend and wires the
 * profile sidebar, EQ editor, speaker panel, USB connect stub, and
 * language switcher together.
 *
 * One shell serves three layouts. The sidebar is permanent on desktop,
 * a drawer on tablet, and a bottom sheet on the phone. The phone layout
 * also renders one tab at a time.
 *
 * `api`, `localeStorage` and `phoneLayoutQuery` default to real
 * implementations but are settable properties so tests can inject fakes
 * instead of mocking `fetch`/`navigator`/`localStorage`/`matchMedia`.
 */
@customElement("app-root")
export class AppRoot extends LitElement {
  static override styles = appRootStyles;

  @property({ attribute: false }) api: ProfileApi = new DeqApiClient();
  @property({ attribute: false }) localeStorage: LocaleStorage = browserLocaleStorage;
  @property({ attribute: false }) browserLanguages: readonly string[] = resolveGlobalLanguages();
  @property({ attribute: false }) phoneLayoutQuery: PhoneLayoutQuery = browserPhoneLayoutQuery;

  @state() private profiles: ProfileDto[] = [];
  @state() private selectedId: number | null = null;
  @state() private locale: Locale = "en";
  @state() private eqStyle: EqStyleId | null = null;
  @state() private liveSimulation: LiveSimulationId = "off";
  @state() private applause = false;
  @state() private profilesDrawerOpen = false;
  @state() private phoneLayout = false;
  @state() private phoneTab: PhoneTab = "eq";

  private unsubscribePhoneLayout: (() => void) | null = null;

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.profilesDrawerOpen) {
      this.closeProfilesDrawer();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.locale = resolveInitialLocale(this.localeStorage, this.browserLanguages);
    this.phoneLayout = this.phoneLayoutQuery.matches();
    this.unsubscribePhoneLayout = this.phoneLayoutQuery.subscribe((matches) => {
      this.phoneLayout = matches;
    });
    this.loadProfiles();
    window.addEventListener("keydown", this.onKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKeydown);
    this.unsubscribePhoneLayout?.();
    this.unsubscribePhoneLayout = null;
  }

  private get selectedProfile(): ProfileDto | undefined {
    return this.profiles.find((profile) => profile.id === this.selectedId);
  }

  override render() {
    const strings = uiStrings(this.locale);
    return html`
      ${this.renderProfilesDrawer(strings)}
      <div class="content">
        <header>
          <div class="header-start">
            ${renderProfilesToggle(strings, () => this.openProfilesDrawer())}
            <div class="wordmark">${renderWordmarkIcon()}<h1>DEQ Tune</h1></div>
          </div>
          <div class="header-controls">
            ${this.phoneLayout ? nothing : this.renderLocaleSwitcher()}
            <connect-device .locale=${this.locale}></connect-device>
          </div>
        </header>
        <main>
          ${this.selectedProfile === undefined
            ? nothing
            : renderHeadingRow(this.selectedProfile, this.locale)}
          ${this.phoneLayout ? this.renderPhonePanels(strings) : this.renderWidePanels(strings)}
        </main>
        ${this.phoneLayout ? this.renderTabBar(strings) : nothing}
      </div>
    `;
  }

  private renderProfilesDrawer(strings: UiStrings): TemplateResult {
    return html`
      ${this.profilesDrawerOpen
        ? html`<div class="drawer-backdrop" @click=${() => this.closeProfilesDrawer()}></div>`
        : null}
      <aside class="drawer ${this.profilesDrawerOpen ? "open" : ""}">
        <div class="grab-handle"></div>
        <div class="sidebar-wordmark">${renderWordmarkIcon()}<h1>DEQ Tune</h1></div>
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
        ${this.phoneLayout
          ? html`<div class="sheet-locale">${this.renderLocaleSwitcher()}</div>`
          : nothing}
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

  /** The phone header has no room for the language control, so the
   * phone layout puts it in the profiles sheet instead. */
  private renderLocaleSwitcher(): TemplateResult {
    return html`
      <locale-switcher
        .locale=${this.locale}
        @locale-change=${(localeChangeEvent: CustomEvent<{ locale: Locale }>) =>
          this.changeLocale(localeChangeEvent.detail.locale)}
      ></locale-switcher>
    `;
  }

  /** Tablet and desktop show every panel at once. The grid areas in
   * `app-root.styles.ts` place them per layout. */
  private renderWidePanels(strings: UiStrings): TemplateResult {
    return html`
      <div class="panels">
        ${this.renderEqPanel(strings)} ${this.renderSpeakerPanel(strings)}
        ${this.renderStylePanel()}
      </div>
    `;
  }

  /** The phone shows one tab at a time. */
  private renderPhonePanels(strings: UiStrings): TemplateResult {
    return html`<div class="panels">${this.renderPhoneTabContent(strings)}</div>`;
  }

  private renderPhoneTabContent(strings: UiStrings): TemplateResult {
    if (this.phoneTab === "speakers") {
      return this.renderSpeakerPanel(strings);
    }
    if (this.phoneTab === "style") {
      return this.renderStylePanel();
    }
    return this.renderEqPanel(strings);
  }

  private renderTabBar(strings: UiStrings): TemplateResult {
    const tabs: ReadonlyArray<{ id: PhoneTab; label: string }> = [
      { id: "eq", label: strings.tabEq },
      { id: "speakers", label: strings.speakers },
      { id: "style", label: strings.tabStyle },
    ];
    return html`
      <nav class="tab-bar">
        ${tabs.map(
          (tab) => html`
            <button
              type="button"
              class="tab"
              aria-pressed=${this.phoneTab === tab.id}
              @click=${() => (this.phoneTab = tab.id)}
            >
              ${tab.label}
            </button>
          `,
        )}
      </nav>
    `;
  }

  private renderEqPanel(strings: UiStrings): TemplateResult {
    const profile = this.selectedProfile;
    if (profile === undefined) {
      return html`<div class="area-eq">${renderNoSelection(strings)}</div>`;
    }
    return html`
      <eq-editor
        class="area-eq"
        label=${strings.channelFront}
        .gains=${frontGains(profile.data)}
        @gain-change=${(gainChangeEvent: CustomEvent<{ band: number; value: number }>) =>
          this.changeGain(gainChangeEvent.detail.band, gainChangeEvent.detail.value)}
      ></eq-editor>
    `;
  }

  private renderSpeakerPanel(strings: UiStrings): TemplateResult {
    const profile = this.selectedProfile;
    if (profile === undefined) {
      return html`<div class="area-speakers"></div>`;
    }
    return html`
      <div class="area-speakers">
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
      </div>
    `;
  }

  private renderStylePanel(): TemplateResult {
    return html`
      <dsp-panel
        class="area-style"
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

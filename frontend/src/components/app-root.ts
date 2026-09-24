import { html, LitElement, nothing, type TemplateResult } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { DeqApiClient, type ProfileApi } from "../api/client.ts";
import type { ProfileDto, Speaker, TuningDataDto } from "../dto/profile.dto.ts";
import { frontGains, withFrontGain, withSpeakerField } from "../dto/tuning-data-edits.ts";
import { browserLocaleStorage } from "../i18n/browser-locale-storage.ts";
import { type Locale, type LocaleStorage, resolveInitialLocale, saveLocale } from "../i18n/locale.ts";
import { localizedModelName, localizedSpeakerTypeLabel } from "../i18n/preset-names.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import type { EqStyleId, LiveSimulationId } from "../i18n/dsp-presets.ts";
import { browserLayoutQuery, type AppLayout, type LayoutQuery } from "../layout-query.ts";
import { countEdits } from "../tuning-edit-count.ts";
import "./profile-list.ts";
import "./eq-editor.ts";
import "./speaker-panel.ts";
import "./connect-device.ts";
import type { ConnectProblem } from "./connect-device.ts";
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

/** The badge text: neutral for untouched factory data, and a count of
 * the edits once the user changes something. */
function editBadgeText(strings: UiStrings, editCount: number): string {
  if (editCount === 0) {
    return strings.factoryBadge;
  }
  return editCount === 1
    ? strings.editedBadgeOne
    : strings.editedBadgeMany.replace("{count}", String(editCount));
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
 * `api`, `localeStorage` and `layoutQuery` default to real
 * implementations but are settable properties so tests can inject fakes
 * instead of mocking `fetch`/`navigator`/`localStorage`/`matchMedia`.
 */
@customElement("app-root")
export class AppRoot extends LitElement {
  static override styles = appRootStyles;

  @property({ attribute: false }) api: ProfileApi = new DeqApiClient();
  @property({ attribute: false }) localeStorage: LocaleStorage = browserLocaleStorage;
  @property({ attribute: false }) browserLanguages: readonly string[] = resolveGlobalLanguages();
  @property({ attribute: false }) layoutQuery: LayoutQuery = browserLayoutQuery;

  @state() private profiles: ProfileDto[] = [];
  @state() private selectedId: number | null = null;
  @state() private locale: Locale = "en";
  @state() private eqStyle: EqStyleId | null = null;
  @state() private liveSimulation: LiveSimulationId = "off";
  @state() private applause = false;
  @state() private profilesDrawerOpen = false;
  @state() private layout: AppLayout = "desktop";
  @state() private phoneTab: PhoneTab = "eq";
  @state() private connectProblem: ConnectProblem | null = null;

  /** Edits to a factory preset live here until the user saves them. */
  @state() private draft: TuningDataDto | null = null;

  /** `confirmDiscard` asks before a draft is dropped. It defaults to
   * the browser dialog but a test can answer it without one. */
  @property({ attribute: false }) confirmDiscard: (question: string) => boolean = (question) =>
    typeof window === "undefined" ? true : window.confirm(question);

  private unsubscribeLayout: (() => void) | null = null;

  private readonly onKeydown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && this.profilesDrawerOpen) {
      this.closeProfilesDrawer();
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.locale = resolveInitialLocale(this.localeStorage, this.browserLanguages);
    this.layout = this.layoutQuery.current();
    this.unsubscribeLayout = this.layoutQuery.subscribe((layout) => {
      this.layout = layout;
    });
    this.loadProfiles();
    window.addEventListener("keydown", this.onKeydown);
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this.onKeydown);
    this.unsubscribeLayout?.();
    this.unsubscribeLayout = null;
  }

  private get selectedProfile(): ProfileDto | undefined {
    return this.profiles.find((profile) => profile.id === this.selectedId);
  }

  private get isPhoneLayout(): boolean {
    return this.layout === "phone";
  }

  /** The data the panels show: the draft while it exists, else the
   * stored profile. */
  private get shownData(): TuningDataDto | undefined {
    return this.draft ?? this.selectedProfile?.data;
  }

  /** The factory data the edits compare against. */
  private get factoryData(): TuningDataDto | undefined {
    const profile = this.selectedProfile;
    if (profile === undefined) {
      return undefined;
    }
    if (profile.source === "factory") {
      return profile.data;
    }
    return this.profiles.find(
      (candidate) =>
        candidate.source === "factory" &&
        candidate.car_model === profile.car_model &&
        candidate.speaker_type === profile.speaker_type,
    )?.data;
  }

  private get editCount(): number {
    const shown = this.shownData;
    const factory = this.factoryData;
    return shown === undefined || factory === undefined ? 0 : countEdits(shown, factory);
  }

  /** The factory curve to draw behind your own. A factory profile
   * compares against itself. A custom profile compares against the
   * factory profile for the same car model and speaker type. */
  private get factoryGains(): number[] {
    const factory = this.factoryData;
    return factory === undefined ? [] : frontGains(factory);
  }

  override render() {
    const strings = uiStrings(this.locale);
    return html`
      ${this.renderProfilesDrawer(strings)}
      <div class="content">
        <header>
          <div class="header-start">
            ${this.isPhoneLayout
              ? html`<div class="wordmark">${renderWordmarkIcon()}</div>`
              : html`
                  ${renderProfilesToggle(strings, () => this.openProfilesDrawer())}
                  <div class="wordmark">${renderWordmarkIcon()}<h1>DEQ Tune</h1></div>
                `}
            ${this.isPhoneLayout ? this.renderPhoneProfileButton(strings) : nothing}
          </div>
          <div class="header-controls">
            ${this.isPhoneLayout
              ? nothing
              : html`${this.renderLocaleSwitcher()}<span class="header-divider"></span>`}
            <connect-device
              .locale=${this.locale}
              .layout=${this.layout}
              @connect-problem=${(problemEvent: CustomEvent<{ problem: ConnectProblem | null }>) =>
                (this.connectProblem = problemEvent.detail.problem)}
            ></connect-device>
            ${this.isPhoneLayout ? nothing : this.renderConnectProblem(strings, "toast")}
          </div>
        </header>
        <main>
          ${this.isPhoneLayout ? this.renderConnectProblem(strings, "banner") : nothing}
          ${this.selectedProfile === undefined
            ? nothing
            : this.renderHeadingRow(strings, this.selectedProfile)}
          ${this.isPhoneLayout ? this.renderPhonePanels(strings) : this.renderWidePanels(strings)}
        </main>
        ${this.isPhoneLayout ? this.renderSaveBar(strings) : nothing}
        ${this.isPhoneLayout ? this.renderTabBar(strings) : nothing}
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
        ${this.isPhoneLayout
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
          @rename-profile=${(renameEvent: CustomEvent<{ id: number; name: string }>) =>
            this.renameProfile(renameEvent.detail.id, renameEvent.detail.name)}
          @create-profile=${() => this.createProfile()}
        ></profile-list>
      </aside>
    `;
  }

  /** The breadcrumb and the model name, with the edit badge and the
   * save actions. A custom profile has no car model, so it shows its
   * own name instead. */
  private renderHeadingRow(strings: UiStrings, profile: ProfileDto): TemplateResult {
    const brand = profile.brand_name;
    const speakerType = localizedSpeakerTypeLabel(profile, this.locale);
    const title = localizedModelName(profile, this.locale) ?? profile.name;
    const editCount = this.editCount;
    return html`
      <div class="heading-row">
        <div class="heading-text">
          <div class="breadcrumb">
            ${brand === null || speakerType === null
              ? nothing
              : html`<span>${brand}</span><span aria-hidden="true">/</span
                  ><span>${speakerType}</span>`}
            <span class="badge ${editCount === 0 ? "" : "edited"}"
              >${editBadgeText(strings, editCount)}</span
            >
          </div>
          <h2 class="profile-title">${title}</h2>
        </div>
        ${this.isPhoneLayout ? nothing : this.renderHeadingActions(strings, editCount)}
      </div>
    `;
  }

  private renderHeadingActions(strings: UiStrings, editCount: number): TemplateResult {
    if (editCount === 0) {
      return html`<span class="start-hint">${strings.startEditingHint}</span>`;
    }
    return html`
      <div class="heading-actions">
        <button type="button" class="secondary" @click=${() => this.revertToFactory()}>
          ${strings.revertToFactory}
        </button>
        ${this.draft === null
          ? nothing
          : html`
              <button type="button" class="primary" @click=${() => this.saveDraftAsProfile()}>
                ${strings.saveAsMyProfile}
              </button>
            `}
      </div>
    `;
  }

  /** The phone puts the same actions in a bar above the tab bar. */
  private renderSaveBar(strings: UiStrings): TemplateResult | typeof nothing {
    const editCount = this.editCount;
    if (editCount === 0) {
      return nothing;
    }
    return html`
      <div class="save-bar">
        <span class="badge edited">${editBadgeText(strings, editCount)}</span>
        <button type="button" class="secondary" @click=${() => this.revertToFactory()}>
          ${strings.revertShort}
        </button>
        ${this.draft === null
          ? nothing
          : html`
              <button type="button" class="primary" @click=${() => this.saveDraftAsProfile()}>
                ${strings.saveShort}
              </button>
            `}
      </div>
    `;
  }

  /** The connect message is a toast under the header on the desktop,
   * and a banner at the top of the content on a touch layout. */
  private renderConnectProblem(
    strings: UiStrings,
    kind: "toast" | "banner",
  ): TemplateResult | typeof nothing {
    if (this.connectProblem === null) {
      return nothing;
    }
    return html`
      <div class="connect-problem ${kind}" role="status">
        <svg class="info-icon" width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <circle cx="9" cy="9" r="7.5" fill="none" stroke="currentColor" stroke-width="1.5" />
          <path
            d="M9 5 V10 M9 12.5 V13"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
          />
        </svg>
        <div class="problem-text">
          <div class="problem-title">${this.connectProblem.title}</div>
          <div class="problem-body">${this.connectProblem.body}</div>
        </div>
        <button
          type="button"
          class="dismiss"
          aria-label=${strings.dismissLabel}
          @click=${() => (this.connectProblem = null)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path
              d="M2 2 L10 10 M10 2 L2 10"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>
    `;
  }

  /** The phone header replaces the wordmark and the profiles button
   * with the selected profile, which opens the sheet. */
  private renderPhoneProfileButton(strings: UiStrings): TemplateResult {
    const profile = this.selectedProfile;
    const title =
      profile === undefined
        ? strings.profilesButton
        : (localizedModelName(profile, this.locale) ?? profile.name);
    const caption =
      profile === undefined ? null : localizedSpeakerTypeLabel(profile, this.locale);
    return html`
      <button type="button" class="profiles-toggle phone" @click=${() => this.openProfilesDrawer()}>
        <span class="phone-profile-text">
          <span class="phone-profile-title">${title}</span>
          ${caption === null
            ? nothing
            : html`<span class="phone-profile-caption">${caption}</span>`}
        </span>
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path
            d="M3 5 L7 9 L11 5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
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
        ${this.renderEqPanel(strings)} ${this.renderSpeakerPanel()}
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
      return this.renderSpeakerPanel();
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
        .gains=${frontGains(this.shownData ?? profile.data)}
        .factoryGains=${this.factoryGains}
        .locale=${this.locale}
        .layout=${this.layout}
        @gain-change=${(gainChangeEvent: CustomEvent<{ band: number; value: number }>) =>
          this.changeGain(gainChangeEvent.detail.band, gainChangeEvent.detail.value)}
      ></eq-editor>
    `;
  }

  private renderSpeakerPanel(): TemplateResult {
    const profile = this.selectedProfile;
    if (profile === undefined) {
      return html`<div class="area-speakers"></div>`;
    }
    return html`
      <div class="area-speakers">
        <speaker-panel
          .speakers=${(this.shownData ?? profile.data).speakers}
          .locale=${this.locale}
          .layout=${this.layout}
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
    if (id === this.selectedId) {
      this.closeProfilesDrawer();
      return;
    }
    if (this.draft !== null && !this.confirmDiscard(uiStrings(this.locale).discardDraftConfirm)) {
      return;
    }
    this.draft = null;
    this.selectedId = id;
    this.closeProfilesDrawer();
  }

  private async duplicateProfile(id: number): Promise<void> {
    const copy = await this.api.duplicateProfile(id);
    await this.loadProfiles();
    this.draft = null;
    this.selectedId = copy.id;
    this.closeProfilesDrawer();
  }

  /** Starts a profile of your own. It copies the data of the selected
   * profile, or of the first factory preset when nothing is selected,
   * so the new profile has a valid curve to edit. */
  private async createProfile(): Promise<void> {
    const source = this.selectedProfile ?? this.profiles.find((profile) => profile.source === "factory");
    if (source === undefined) {
      return;
    }
    const created = await this.api.createProfile({
      name: uiStrings(this.locale).newProfileName,
      data: this.draft ?? source.data,
      brand_name: source.brand_name,
      car_model: source.car_model,
      speaker_type: source.speaker_type,
      supported_processors: source.supported_processors,
    });
    this.draft = null;
    await this.loadProfiles();
    this.selectedId = created.id;
    this.closeProfilesDrawer();
  }

  private async renameProfile(id: number, name: string): Promise<void> {
    const updated = await this.api.updateProfile(id, { name });
    this.profiles = this.profiles.map((profile) => (profile.id === id ? updated : profile));
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
    const shown = this.shownData;
    if (profile === undefined || shown === undefined) {
      return;
    }
    await this.applyEdit(profile, withFrontGain(shown, band, gain));
  }

  private async changeSpeaker(
    channel: string,
    field: keyof Speaker,
    value: number | boolean,
  ): Promise<void> {
    const profile = this.selectedProfile;
    const shown = this.shownData;
    if (profile === undefined || shown === undefined) {
      return;
    }
    await this.applyEdit(profile, withSpeakerField(shown, channel, field, value));
  }

  /** A custom profile saves every edit. A factory preset keeps its
   * edits in the draft until the user saves them as a new profile. */
  private async applyEdit(profile: ProfileDto, data: TuningDataDto): Promise<void> {
    if (profile.source === "factory") {
      this.draft = data;
      return;
    }
    this.draft = data;
    await this.saveProfileData(profile.id, data);
    this.draft = null;
  }

  private revertToFactory(): void {
    this.draft = null;
    const profile = this.selectedProfile;
    const factory = this.factoryData;
    if (profile === undefined || factory === undefined || profile.source === "factory") {
      return;
    }
    this.saveProfileData(profile.id, factory);
  }

  /** Copies the factory preset, writes the draft into the copy, then
   * selects it. */
  private async saveDraftAsProfile(): Promise<void> {
    const profile = this.selectedProfile;
    const draft = this.draft;
    if (profile === undefined || draft === null) {
      return;
    }
    const copy = await this.api.duplicateProfile(profile.id);
    await this.api.updateProfile(copy.id, { data: draft });
    this.draft = null;
    await this.loadProfiles();
    this.selectedId = copy.id;
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

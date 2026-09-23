import { html, LitElement, type TemplateResult } from "lit";
import { customElement, property } from "lit/decorators.js";
import type { ProfileDto } from "../dto/profile.dto.ts";
import type { Locale } from "../i18n/locale.ts";
import { localizedProfileName } from "../i18n/preset-names.ts";
import { uiStrings, type UiStrings } from "../i18n/ui-strings.ts";
import { profileListStyles } from "./profile-list.styles.ts";

function renderNameButton(displayName: string, onSelect: () => void): TemplateResult {
  return html`
    <button class="name" type="button" @click=${onSelect}>${displayName}</button>
  `;
}

function renderDuplicateButton(label: string, onDuplicate: () => void): TemplateResult {
  return html`<button class="action" type="button" @click=${onDuplicate}>${label}</button>`;
}

function renderDeleteButton(label: string, onDelete: () => void): TemplateResult {
  return html`<button class="action destructive" type="button" @click=${onDelete}>
    ${label}
  </button>`;
}

function renderFactoryItem(
  displayName: string,
  strings: UiStrings,
  isSelected: boolean,
  onSelect: () => void,
  onDuplicate: () => void,
): TemplateResult {
  return html`
    <li aria-current=${isSelected ? "true" : "false"}>
      ${renderNameButton(displayName, onSelect)}
      <div class="actions">${renderDuplicateButton(strings.duplicate, onDuplicate)}</div>
    </li>
  `;
}

function renderCustomItem(
  displayName: string,
  strings: UiStrings,
  isSelected: boolean,
  onSelect: () => void,
  onDuplicate: () => void,
  onDelete: () => void,
): TemplateResult {
  return html`
    <li aria-current=${isSelected ? "true" : "false"}>
      ${renderNameButton(displayName, onSelect)}
      <div class="actions">
        ${renderDuplicateButton(strings.duplicate, onDuplicate)}
        ${renderDeleteButton(strings.delete, onDelete)}
      </div>
    </li>
  `;
}

/**
 * Lists profiles, grouped by source. Emits `select-profile`
 * ({ id }), `duplicate-profile` ({ id }) and `delete-profile` ({ id }).
 */
@customElement("profile-list")
export class ProfileList extends LitElement {
  static override styles = profileListStyles;

  @property({ type: Array }) profiles: ProfileDto[] = [];
  @property({ type: Number }) selectedId: number | null = null;
  @property({ type: String }) locale: Locale = "en";

  override render() {
    const strings = uiStrings(this.locale);
    const factoryProfiles = this.profiles.filter((profile) => profile.source === "factory");
    const customProfiles = this.profiles.filter((profile) => profile.source === "custom");

    return html`
      <section>
        <h3>${strings.myProfiles}</h3>
        ${customProfiles.length === 0
          ? html`<p class="empty">${strings.duplicateHint}</p>`
          : html`
              <ul>
                ${customProfiles.map((profile) =>
                  renderCustomItem(
                    localizedProfileName(profile, this.locale),
                    strings,
                    profile.id === this.selectedId,
                    () => this.selectProfile(profile.id),
                    () => this.duplicateProfile(profile.id),
                    () => this.deleteProfile(profile.id),
                  ),
                )}
              </ul>
            `}
      </section>
      <section>
        <h3>${strings.factoryPresets}</h3>
        <ul>
          ${factoryProfiles.map((profile) =>
            renderFactoryItem(
              localizedProfileName(profile, this.locale),
              strings,
              profile.id === this.selectedId,
              () => this.selectProfile(profile.id),
              () => this.duplicateProfile(profile.id),
            ),
          )}
        </ul>
      </section>
    `;
  }

  private selectProfile(id: number) {
    this.dispatchEvent(new CustomEvent("select-profile", { detail: { id } }));
  }

  private duplicateProfile(id: number) {
    this.dispatchEvent(new CustomEvent("duplicate-profile", { detail: { id } }));
  }

  private deleteProfile(id: number) {
    this.dispatchEvent(new CustomEvent("delete-profile", { detail: { id } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "profile-list": ProfileList;
  }
}

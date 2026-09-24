import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators.js";
import { SUPPORTED_LOCALES, type Locale } from "../i18n/locale.ts";
import { uiStrings } from "../i18n/ui-strings.ts";
import { localeSwitcherStyles } from "./locale-switcher.styles.ts";

const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  ja: "日本語",
  de: "Deutsch",
  fr: "Français",
  es: "Español",
  nl: "Nederlands",
};

/** A `<select>` of the supported locales. Emits `locale-change` with
 * `{ locale }` on selection. */
@customElement("locale-switcher")
export class LocaleSwitcher extends LitElement {
  static override styles = localeSwitcherStyles;

  @property({ type: String }) locale: Locale = "en";

  override render() {
    return html`
      <label>
        <svg class="globe" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.3" />
          <path
            d="M1.5 8 H14.5 M8 1.5 C5.5 4 5.5 12 8 14.5 M8 1.5 C10.5 4 10.5 12 8 14.5"
            fill="none"
            stroke="currentColor"
            stroke-width="1.3"
          />
        </svg>
        <span class="visually-hidden">${uiStrings(this.locale).languageLabel}</span>
        <select @change=${(event: Event) => this.onChange(event)}>
          ${SUPPORTED_LOCALES.map(
            (locale) => html`
              <option value=${locale} ?selected=${locale === this.locale}>
                ${LOCALE_NAMES[locale]}
              </option>
            `,
          )}
        </select>
      </label>
    `;
  }

  private onChange(event: Event) {
    const locale = (event.target as HTMLSelectElement).value as Locale;
    this.dispatchEvent(new CustomEvent("locale-change", { detail: { locale } }));
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "locale-switcher": LocaleSwitcher;
  }
}

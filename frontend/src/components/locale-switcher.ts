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
        ${uiStrings(this.locale).languageLabel}
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

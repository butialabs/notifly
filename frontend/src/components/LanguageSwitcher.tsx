import clsx from "clsx";
import { type Lang, LANGS, useI18n } from "../i18n";

/** Language picker: a native select listing every language in LANGS by its own name. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, lang, setLang } = useI18n();
  return (
    <select
      aria-label={t("lang.label")}
      title={t("lang.label")}
      data-lang-switch
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      className={clsx(
        "min-h-9 shrink-0 rounded-lg border border-rule bg-white px-2 text-sm font-semibold text-ink-soft transition-colors hover:text-brand-700 pointer-coarse:min-h-11",
        className,
      )}
    >
      {LANGS.map((l) => (
        <option key={l} value={l} lang={l}>
          {t(`lang.${l}`)}
        </option>
      ))}
    </select>
  );
}

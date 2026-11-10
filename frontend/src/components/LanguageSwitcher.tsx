import clsx from "clsx";
import { LANGS, useI18n } from "../i18n";
import { BtnLabel } from "./ui";

/** Compact PT/EN switch: two buttons with aria-pressed. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div role="group" aria-label={t("lang.label")} className={clsx("flex shrink-0 overflow-hidden rounded-lg border border-rule", className)}>
      {LANGS.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          data-lang-switch={l}
          aria-pressed={lang === l}
          aria-label={t(`lang.${l}`)}
          title={t(`lang.${l}`)}
          onClick={() => setLang(l)}
          className={clsx(
            "inline-flex min-h-9 items-center px-2.5 text-sm leading-none font-semibold transition-colors pointer-coarse:min-h-11",
            lang === l ? "bg-brand-50 text-brand-700" : "bg-white text-ink-soft hover:bg-brand-50 hover:text-brand-700",
          )}
        >
          <BtnLabel>{t(`lang.short.${l}`)}</BtnLabel>
        </button>
      ))}
    </div>
  );
}

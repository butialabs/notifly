import { createContext, Fragment, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { applyLang, getLang, type Lang, t } from "./core";

export { dateLocale, getLang, LANGS, t } from "./core";
export type { Lang, MessageKey, Vars } from "./core";

interface I18nValue {
  t: typeof t;
  lang: Lang;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nValue>({ t, lang: getLang(), setLang: applyLang });

/** Remounts the tree when the language changes (key = lang) so pure date and money formatters follow it. */
export function I18nProvider({ children, onChange }: { children: ReactNode; onChange?: (lang: Lang) => void }) {
  const [lang, setState] = useState<Lang>(getLang);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const first = useRef(true);

  const setLang = useCallback((next: Lang) => {
    if (next === getLang()) return;
    applyLang(next);
    setState(next);
    onChangeRef.current?.(next);
  }, []);

  // Remounting drops focus from the switcher; give it back to the chosen language's button.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!document.activeElement || document.activeElement === document.body) {
      document.querySelector<HTMLElement>(`[data-lang-switch="${lang}"]`)?.focus();
    }
  }, [lang]);

  const value = useMemo(() => ({ t, lang, setLang }), [lang, setLang]);
  return (
    <I18nContext.Provider value={value}>
      <Fragment key={lang}>{children}</Fragment>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

/**
 * Language state outside React: pure functions (lib/format, lib/api, lib/verdict) read
 * the current language here. I18nProvider changes it and remounts the tree.
 */
import { enUS, ptBR as dfPtBR } from "date-fns/locale";
import { en } from "./locales/en";
import { ptBR } from "./locales/pt-BR";
import type { Lang, MessageKey, Messages, Vars } from "./types";

export type { Lang, MessageKey, Messages, Vars } from "./types";

export const LANGS: readonly Lang[] = ["pt-BR", "en"];
const STORAGE_KEY = "notifly.lang";
const DICTS: Record<Lang, Messages> = { "pt-BR": ptBR, en };

function isLang(v: unknown): v is Lang {
  return v === "pt-BR" || v === "en";
}

function storedLang(): Lang | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return isLang(v) ? v : null;
  } catch {
    return null;
  }
}

function browserLang(): Lang {
  try {
    const first = navigator.languages?.find(Boolean) ?? navigator.language ?? "";
    return first.toLowerCase().startsWith("pt") ? "pt-BR" : "en";
  } catch {
    return "en";
  }
}

let current: Lang = storedLang() ?? browserLang();
let plural = new Intl.PluralRules(current);

function syncDocument() {
  try {
    document.documentElement.lang = current;
  } catch {
    /* no DOM */
  }
}
syncDocument();

export function getLang(): Lang {
  return current;
}

/** Change the global language. Doesn't re-render; the provider does that. */
export function applyLang(lang: Lang) {
  current = lang;
  plural = new Intl.PluralRules(lang);
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    /* storage blocked: applies to this session only */
  }
  syncDocument();
}

export function dateLocale() {
  return current === "en" ? enUS : dfPtBR;
}

/**
 * Translate a key ("watch.title"), filling `{var}` from `vars`. For a plural, picks the
 * form by `vars.n`: `zero` when n = 0 and it exists, else Intl.PluralRules, else `other`.
 */
export function t(key: MessageKey, vars?: Vars): string {
  let node: unknown = DICTS[current];
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (node && typeof node === "object") {
    const forms = node as Record<string, string | undefined>;
    const n = Number(vars?.n ?? 0);
    node = (n === 0 ? forms.zero : undefined) ?? forms[plural.select(n)] ?? forms.other;
  }
  if (typeof node !== "string") return key;
  if (!vars) return node;
  return node.replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m));
}

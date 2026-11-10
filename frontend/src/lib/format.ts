import { addDays, format, formatDistanceToNowStrict, parseISO } from "date-fns";
import { dateLocale, getLang, t } from "../i18n/core";
import type { Cabin, FlightQuery, RuleKind, Stops } from "./api";

export function money(value: number | null | undefined, currency?: string | null) {
  if (value === null || value === undefined) return "—";
  try {
    return new Intl.NumberFormat(getLang(), {
      style: "currency",
      currency: currency || "BRL",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency ?? ""} ${Math.round(value)}`;
  }
}

export function duration(minutes: number | null | undefined) {
  if (!minutes) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t("format.hm", { h, m }) : t("format.h", { h });
}

/** Backend dates are UTC without a timezone. */
export function utc(iso: string) {
  return parseISO(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
}

export function relative(iso?: string | null) {
  if (!iso) return t("format.never");
  const d = utc(iso);
  const s = formatDistanceToNowStrict(d, { locale: dateLocale(), addSuffix: true });
  return s;
}

export function dateTime(iso?: string | null) {
  if (!iso) return "—";
  return format(utc(iso), t("dates.dateTime"), { locale: dateLocale() });
}

/** Flight times are local to the airport: don't convert timezones. */
export function time(localIso: string) {
  return localIso.slice(11, 16);
}

export function dayDiff(a: string, b: string) {
  const d1 = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const d2 = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((d2 - d1) / 86400000);
}

export function shortDate(isoDate?: string | null) {
  if (!isoDate) return "—";
  return format(parseISO(isoDate.slice(0, 10)), t("dates.short"), { locale: dateLocale() });
}

export function tinyDate(isoDate: string) {
  return format(parseISO(isoDate.slice(0, 10)), t("dates.tiny"), { locale: dateLocale() });
}

export function isoDate(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function plusDays(iso: string, days: number) {
  return isoDate(addDays(parseISO(iso), days));
}

const CABINS: Cabin[] = ["economy", "premium_economy", "business", "first"];
const STOPS: Stops[] = ["any", "nonstop", "one", "two"];
const RULES: RuleKind[] = ["price_drop", "price_rise", "price_change", "below_threshold", "above_threshold", "new_lowest"];

/** Labels in the current language (functions, since the language can change at runtime). */
export function cabinLabels(): Record<Cabin, string> {
  return Object.fromEntries(CABINS.map((k) => [k, t(`format.cabin.${k}`)])) as Record<Cabin, string>;
}

export function stopsLabels(): Record<Stops, string> {
  return Object.fromEntries(STOPS.map((k) => [k, t(`format.stopsFilter.${k}`)])) as Record<Stops, string>;
}

export function ruleLabels(): Record<RuleKind, string> {
  return Object.fromEntries(RULES.map((k) => [k, t(`format.rule.${k}`)])) as Record<RuleKind, string>;
}

export function ruleLabel(kind: RuleKind) {
  return t(`format.rule.${kind}`);
}

export function isRuleKind(kind: unknown): kind is RuleKind {
  return RULES.includes(kind as RuleKind);
}

export function stopsText(n: number) {
  return t("format.stops", { n });
}

export function intervalText(min: number) {
  if (min < 60) return t("format.min", { m: min });
  if (min % 1440 === 0) return t("format.days", { n: min / 1440 });
  if (min % 60 === 0) return t("format.h", { h: min / 60 });
  return t("format.hm", { h: Math.floor(min / 60), m: min % 60 });
}

export function paxCount(q: FlightQuery) {
  const p = q.passengers;
  return p.adults + p.children + p.infants_in_seat + p.infants_on_lap;
}

export function querySummary(q: FlightQuery) {
  const parts: string[] = [];
  const s0 = q.segments[0];
  parts.push(shortDate(s0.date) + (q.return_date ? ` – ${shortDate(q.return_date)}` : ""));
  const pax = paxCount(q);
  parts.push(t("common.passengers", { n: pax }));
  parts.push(t(`format.cabin.${q.cabin}`));
  if (q.max_stops !== "any") parts.push(t(`format.stopsFilter.${q.max_stops}`));
  return parts.join(" · ");
}

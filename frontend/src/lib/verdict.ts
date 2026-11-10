import type { Rule, Watch } from "./api";
import { t } from "../i18n/core";
import { money } from "./format";

export type VerdictKind = "buy" | "wait" | "none" | "stale";

export interface Verdict {
  kind: VerdictKind;
  word: string;
  reason: string;
  /** nearest active below_threshold */
  threshold?: number;
}

/**
 * Verdict from the owner's own rules: "buy" when the current price is the lowest seen
 * or below an active below_threshold. It is not a forecast.
 */
export function verdictFor(w: Watch & { applicable_rules?: Rule[] }): Verdict {
  const cur = w.last_price;
  const cur$ = (v: number | null | undefined) => money(v, w.currency);
  if (cur == null) {
    return w.last_checked_at
      ? { kind: "stale", word: t("verdict.stale"), reason: t("verdict.staleReason") }
      : { kind: "none", word: t("verdict.queued"), reason: t("verdict.queuedReason") };
  }
  const limits = (w.applicable_rules ?? [])
    .filter((r) => r.enabled && r.kind === "below_threshold" && r.threshold)
    .map((r) => r.threshold as number)
    .sort((a, b) => b - a);
  const metLimit = limits.find((t) => cur <= t);
  const atLowest = w.lowest_price != null && cur <= w.lowest_price;
  const onlyOneCheck = w.highest_price != null && w.lowest_price === w.highest_price;

  if (metLimit != null) {
    return {
      kind: "buy",
      word: t("verdict.buy"),
      reason: t("verdict.belowLimit", {
        diff: cur$(metLimit - cur),
        limit: cur$(metLimit),
        extra: atLowest && !onlyOneCheck ? t("verdict.belowLimitLowest") : "",
      }),
      threshold: metLimit,
    };
  }
  if (atLowest && !onlyOneCheck) {
    return { kind: "buy", word: t("verdict.buy"), reason: t("verdict.lowest") };
  }
  const nextLimit = limits.length ? Math.max(...limits) : undefined;
  if (onlyOneCheck) {
    return {
      kind: "wait",
      word: t("verdict.wait"),
      reason: nextLimit
        ? t("verdict.oneCheckLimit", { diff: cur$(cur - nextLimit), limit: cur$(nextLimit) })
        : t("verdict.oneCheck"),
      threshold: nextLimit,
    };
  }
  const aboveLow = w.lowest_price != null ? cur - w.lowest_price : 0;
  return {
    kind: "wait",
    word: t("verdict.wait"),
    reason: nextLimit
      ? t("verdict.aboveLowLimit", { above: cur$(aboveLow), diff: cur$(cur - nextLimit), limit: cur$(nextLimit) })
      : t("verdict.aboveLow", { above: cur$(aboveLow), lowest: cur$(w.lowest_price) }),
    threshold: nextLimit,
  };
}

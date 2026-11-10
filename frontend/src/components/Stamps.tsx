import clsx from "clsx";
import type { CSSProperties, ReactNode } from "react";
import { t } from "../i18n";
import type { HistoryPoint } from "../lib/api";
import { money, utc } from "../lib/format";

export const DEFAULT_TRIP_EMOJI = "✈️";

/** Flags (regional indicators) render as letters on Windows. */
export function isFlagEmoji(e: string) {
  return /[\u{1F1E6}-\u{1F1FF}]/u.test(e);
}

export function stampEmoji(emoji?: string | null) {
  const e = (emoji ?? "").trim();
  return e && !isFlagEmoji(e) ? e : DEFAULT_TRIP_EMOJI;
}

/**
 * Perforation mask: half circles cut only on the paper edge. Spacing is recomputed to
 * divide width and height exactly, so the teeth line up on all four sides and corners.
 */
function perforationMask(width: number, height: number, target = 8): CSSProperties {
  const gx = width / Math.max(3, Math.round(width / target));
  const gy = height / Math.max(3, Math.round(height / target));
  const r = Math.min(gx, gy) * 0.32;
  const mask = [
    `radial-gradient(circle at 50% 50%, #0000 ${r}px, #000 ${r + 0.6}px) ${-gx / 2}px ${-gy / 2}px / ${gx}px ${gy}px repeat`,
    `linear-gradient(#000 0 0) ${gx / 2}px ${gy / 2}px / calc(100% - ${gx}px) calc(100% - ${gy}px) no-repeat`,
  ].join(", ");
  return { WebkitMask: mask, mask, WebkitMaskComposite: "source-over", maskComposite: "add" };
}

/** Shadow that follows the cut-out (the mask would clip a box-shadow). */
const PAPER_SHADOW =
  "drop-shadow(0 0 0.6px rgb(27 31 43 / 0.55)) drop-shadow(0 1px 1px rgb(27 31 43 / 0.18)) drop-shadow(0 3px 6px rgb(31 58 147 / 0.12))";

/** Stamp paper: white, perforated, with a margin around the printed area. */
function StampPaper({
  width,
  height,
  margin,
  children,
  printStyle,
  printClassName,
  target,
}: {
  width: number;
  height: number;
  margin: number;
  children: ReactNode;
  printStyle?: CSSProperties;
  printClassName?: string;
  target?: number;
}) {
  return (
    <span className="inline-block shrink-0" style={{ filter: PAPER_SHADOW }} aria-hidden>
      <span
        className="block bg-white"
        style={{ ...perforationMask(width, height, target), width, height, padding: margin }}
      >
        <span className={clsx("block h-full w-full", printClassName)} style={printStyle}>
          {children}
        </span>
      </span>
    </span>
  );
}

/** Trip stamp with the chosen emoji (✈️ by default). */
export function TripStamp({
  emoji,
  size = 48,
}: {
  id?: number;
  name?: string;
  emoji?: string | null;
  size?: number;
}) {
  const width = size;
  const height = Math.round(size * 1.2);
  const margin = Math.max(4, Math.round(size * 0.12));
  const inner = Math.min(width, height) - margin * 2;
  return (
    <StampPaper
      width={width}
      height={height}
      margin={margin}
      target={size < 40 ? 6 : 8}
      printClassName="grid place-items-center"
      printStyle={{
        fontSize: Math.max(14, Math.round(inner * 0.62)),
        lineHeight: 1,
      }}
    >
      {stampEmoji(emoji)}
    </StampPaper>
  );
}

/** Stamp sheet: one stamp per check with a price. */
export function StampSheet({
  points,
  currency,
  lowest,
  max = 14,
}: {
  points: HistoryPoint[];
  currency?: string | null;
  lowest?: number | null;
  max?: number;
}) {
  const recent = points.slice(-max);
  if (recent.length === 0) return null;
  return (
    <ol className="flex gap-3 overflow-x-auto rounded-lg bg-paper p-3" aria-label={t("stamps.sheet")}>
      {recent.map((p, i) => {
        const prev = i > 0 ? recent[i - 1] : undefined;
        const isLow = p.ok && p.min_price != null && lowest != null && p.min_price <= lowest;
        const dir = p.min_price != null && prev?.min_price != null ? Math.sign(p.min_price - prev.min_price) : 0;
        const d = utc(p.checked_at);
        const when = t("stamps.when", {
          day: String(d.getDate()).padStart(2, "0"),
          month: String(d.getMonth() + 1).padStart(2, "0"),
          hour: String(d.getHours()).padStart(2, "0"),
        });
        const note = t(!p.ok ? "stamps.error" : isLow ? "stamps.lowest" : dir < 0 ? "stamps.down" : dir > 0 ? "stamps.up" : "stamps.same");
        return (
          <li key={p.id} className="shrink-0" title={p.error ?? undefined}>
            <span className="sr-only">
              {when}: {p.ok && p.min_price != null ? money(p.min_price, currency) : t("stamps.returnedSr")}, {note}
            </span>
            <StampPaper
              width={120}
              height={112}
              margin={8}
              printClassName={clsx(
                "flex flex-col justify-between px-2.5 py-2",
                !p.ok ? "bg-red-50" : isLow ? "bg-good-soft" : "bg-paper",
              )}
              printStyle={{
                boxShadow: `inset 0 0 0 1.5px ${!p.ok ? "rgb(180 35 24 / 0.45)" : isLow ? "var(--color-good)" : "var(--color-rule)"}`,
              }}
            >
              <span className="block text-sm font-semibold text-ink-mute tnum">{when}</span>
              {p.ok && p.min_price != null ? (
                <span className={clsx("denom block text-[26px]", dir < 0 || isLow ? "text-good" : dir > 0 ? "text-bad" : "text-ink")}>
                  {money(p.min_price, currency).replace(/^R\$\s?/, "")}
                </span>
              ) : (
                <span className="denom block text-[20px] text-danger">{t("stamps.returned")}</span>
              )}
              <span className={clsx("block text-sm font-semibold", isLow ? "text-good" : !p.ok ? "text-danger" : "text-ink-mute")}>
                {note}
              </span>
            </StampPaper>
          </li>
        );
      })}
    </ol>
  );
}

/** App mark: the plane emoji, without a stamp. */
export function BrandStamp({ size = 30 }: { size?: number }) {
  return (
    <span aria-hidden className="inline-block shrink-0 leading-none" style={{ fontSize: size }}>
      {DEFAULT_TRIP_EMOJI}
    </span>
  );
}

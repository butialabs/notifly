import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { useId } from "react";
import { t } from "../i18n";
import { api } from "../lib/api";
import { utc } from "../lib/format";

export type PostmarkKind = "ok" | "returned" | "pending";

const INK: Record<PostmarkKind, string> = {
  ok: "var(--color-brand-600)",
  returned: "var(--color-danger)",
  pending: "var(--color-ink-mute)",
};

export function postmarkKind(opts: { ok?: boolean; checked?: boolean }): PostmarkKind {
  if (!opts.checked) return "pending";
  return opts.ok === false ? "returned" : "ok";
}

export function postmarkLabel(kind: PostmarkKind) {
  return t(`postmark.label.${kind}`);
}

/** Postal cancellation mark showing when and where the price came from. SVG; `size` in px. */
export function Postmark({
  at,
  kind,
  size = 112,
  rotate = -12,
  waves = false,
  strike = false,
  className,
}: {
  at?: string | null;
  kind: PostmarkKind;
  size?: number;
  rotate?: number;
  waves?: boolean;
  strike?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  // Without a country the mark reads just "NOTIFLY".
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings, staleTime: 5 * 60_000 });
  const country = settings?.country?.trim().toUpperCase();
  const ink = INK[kind];
  const d = at ? utc(at) : null;
  const day = d ? String(d.getDate()).padStart(2, "0") : "--";
  const mon = d ? t("postmark.months").split(" ")[d.getMonth()] : "---";
  const yr = d ? String(d.getFullYear()).slice(2) : "--";
  const hm = d ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : "--:--";
  const w = waves ? 260 : 120;
  return (
    <svg
      role="img"
      aria-label={
        d
          ? t("postmark.at", { label: postmarkLabel(kind), day, month: String(d.getMonth() + 1).padStart(2, "0"), time: hm })
          : postmarkLabel(kind)
      }
      viewBox={`0 0 ${w} 120`}
      width={(size * w) / 120}
      height={size}
      className={clsx("pointer-events-none select-none", strike && "stamp-strike", className)}
      style={{ ["--rot" as string]: `${rotate}deg`, transform: strike ? undefined : `rotate(${rotate}deg)`, opacity: 0.92 }}
    >
      <defs>
        <path id={`top-${id}`} d="M 18 60 A 42 42 0 0 1 102 60" />
        <path id={`bot-${id}`} d="M 14 60 A 46 46 0 0 0 106 60" />
      </defs>
      <g fill="none" stroke={ink}>
        <circle cx="60" cy="60" r="56" strokeWidth="3" />
        <circle cx="60" cy="60" r="34" strokeWidth="1.6" />
        {waves &&
          [36, 50, 64, 78].map((y) => (
            <path
              key={y}
              d={`M 122 ${y} q 11 -7 22 0 t 22 0 t 22 0 t 22 0 t 22 0 t 22 0`}
              strokeWidth="2.6"
              strokeLinecap="round"
            />
          ))}
      </g>
      <g fill={ink} fontFamily="Archivo Variable, sans-serif" fontWeight={800} style={{ fontStretch: "75%" }}>
        <text fontSize="11.5" letterSpacing="1.4">
          <textPath href={`#top-${id}`} startOffset="50%" textAnchor="middle">
            {t(`postmark.top.${kind}`)}
          </textPath>
        </text>
        <text fontSize="10" letterSpacing="2">
          <textPath href={`#bot-${id}`} startOffset="50%" textAnchor="middle">
            {country ? `NOTIFLY · ${country}` : "NOTIFLY"}
          </textPath>
        </text>
        <text x="60" y="56" fontSize="15" textAnchor="middle" letterSpacing="0.5">
          {day} {mon}
        </text>
        <text x="60" y="73" fontSize="13" textAnchor="middle" fontWeight={700}>
          {hm} · {yr}
        </text>
      </g>
    </svg>
  );
}

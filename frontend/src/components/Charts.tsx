import { format } from "date-fns";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dateLocale, t } from "../i18n";
import type { HistoryPoint } from "../lib/api";
import { money, utc } from "../lib/format";

export function PriceHistoryChart({
  data,
  currency,
  lowest,
  height = 288,
}: {
  data: HistoryPoint[];
  currency?: string | null;
  lowest?: number | null;
  height?: number;
}) {
  const points = data
    .filter((d) => d.min_price !== null)
    .map((d) => ({ t: utc(d.checked_at).getTime(), price: d.min_price, median: d.median_price }));
  if (points.length === 0) {
    return <div className="flex h-64 items-center justify-center text-sm text-ink-mute">{t("charts.empty")}</div>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={points} margin={{ left: 8, right: 8, top: 10 }}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1f3a93" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#1f3a93" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" vertical={false} />
          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(v) => format(v, t("dates.chartTick"), { locale: dateLocale() })}
            tick={{ fontSize: 14, fill: "#5f6880" }}
            minTickGap={40}
          />
          <YAxis
            tickFormatter={(v) => money(v, currency)}
            tick={{ fontSize: 14, fill: "#5f6880" }}
            width={84}
            domain={[(min: number) => Math.floor(min * 0.95), (max: number) => Math.ceil(max * 1.05)]}
          />
          <Tooltip
            labelFormatter={(v) => format(v as number, t("dates.chartTooltip"), { locale: dateLocale() })}
            formatter={(v, name) => [money(v as number, currency), name === "price" ? t("charts.lowest") : t("charts.median")]}
            contentStyle={{ borderRadius: 12, fontSize: 14 }}
          />
          {lowest && <ReferenceLine y={lowest} stroke="#1f7a46" strokeDasharray="4 4" />}
          <Area type="monotone" dataKey="median" stroke="#94a3b8" strokeWidth={1} fill="none" dot={false} />
          <Area type="stepAfter" dataKey="price" stroke="#1f3a93" strokeWidth={2.5} fill="url(#g)" dot={points.length < 40} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

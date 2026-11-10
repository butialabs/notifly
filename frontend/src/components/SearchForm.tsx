import clsx from "clsx";
import { ArrowLeftRight, ChevronDown, Search, Users } from "lucide-react";
import type { ReactNode } from "react";
import type { Cabin, FlightQuery, Segment, Stops, TimeWindow, TripType } from "../lib/api";
import { t } from "../i18n";
import { cabinLabels, isoDate, paxCount, plusDays, stopsLabels } from "../lib/format";
import { AirlineInput } from "./AirlineInput";
import { PlaceInput } from "./PlaceInput";
import { BtnLabel, Button, Popover, Stepper, Toggle } from "./ui";

export function defaultQuery(): FlightQuery {
  const d = plusDays(isoDate(new Date()), 30);
  return {
    trip_type: "round_trip",
    segments: [{ origins: [], destinations: [], date: d }],
    return_date: plusDays(d, 7),
    passengers: { adults: 1, children: 0, infants_in_seat: 0, infants_on_lap: 0 },
    cabin: "economy",
    max_stops: "any",
    airlines: [],
    airlines_exclude: [],
    alliances: [],
    max_duration_minutes: null,
    max_price: null,
    checked_bags: 0,
    carry_on: false,
    exclude_basic_economy: false,
    sort: "best",
  };
}

const tripLabels = (): Record<TripType, string> => ({
  round_trip: t("searchForm.roundTrip"),
  one_way: t("searchForm.oneWay"),
});

const ALLIANCES = ["STAR_ALLIANCE", "ONEWORLD", "SKYTEAM"];


function Select<T extends string>({
  value,
  options,
  onChange,
  icon,
}: {
  value: T;
  options: Record<T, string>;
  onChange: (v: T) => void;
  icon?: ReactNode;
}) {
  return (
    <Popover
      className="min-w-48 p-1"
      trigger={(open) => (
        <button type="button" className={clsx("btn-plain px-3", open && "bg-brand-50")}>
          {icon}
          <BtnLabel>{options[value]}</BtnLabel>
          <ChevronDown size={16} />
        </button>
      )}
    >
      {(close) => (
        <ul>
          {(Object.keys(options) as T[]).map((k) => (
            <li key={k}>
              <button
                type="button"
                className={clsx(
                  "w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50",
                  k === value && "bg-brand-50 font-medium text-brand-700",
                )}
                onClick={() => {
                  onChange(k);
                  close();
                }}
              >
                {options[k]}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

function FilterChip({ label, active, children, wide }: { label: string; active: boolean; children: ReactNode; wide?: boolean }) {
  return (
    <Popover
      className={wide ? "w-80" : "w-72"}
      trigger={() => (
        <button type="button" className={clsx("chip", active && "chip-active")}>
          <BtnLabel>{label}</BtnLabel>
          <ChevronDown size={14} />
        </button>
      )}
    >
      {() => <div className="space-y-3">{children}</div>}
    </Popover>
  );
}

function HourRange({
  label,
  from,
  to,
  onChange,
}: {
  label: string;
  from?: number | null;
  to?: number | null;
  onChange: (from: number | null, to: number | null) => void;
}) {
  const f = from ?? 0;
  const to24 = to ?? 24;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-ink-mute">
          {f === 0 && to24 === 24 ? t("searchForm.anyTime") : `${String(f).padStart(2, "0")}:00 – ${to24 === 24 ? "23:59" : String(to24).padStart(2, "0") + ":00"}`}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="range" min={0} max={23} value={f} className="w-full accent-brand-600"
          onChange={(e) => {
            const v = Math.min(+e.target.value, to24 - 1);
            onChange(v === 0 ? null : v, to ?? null);
          }}
        />
        <input
          type="range" min={1} max={24} value={to24} className="w-full accent-brand-600"
          onChange={(e) => {
            const v = Math.max(+e.target.value, f + 1);
            onChange(from ?? null, v === 24 ? null : v);
          }}
        />
      </div>
    </div>
  );
}

function timesActive(t?: TimeWindow | null) {
  return !!t && Object.values(t).some((v) => v !== null && v !== undefined);
}

export function SearchForm({
  value: q,
  onChange,
  onSubmit,
  submitLabel = t("searchForm.submit"),
  loading,
  compact,
}: {
  value: FlightQuery;
  onChange: (q: FlightQuery) => void;
  onSubmit?: () => void;
  submitLabel?: string;
  loading?: boolean;
  compact?: boolean;
}) {
  const set = (patch: Partial<FlightQuery>) => onChange({ ...q, ...patch });
  const setSeg = (i: number, patch: Partial<Segment>) =>
    set({ segments: q.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });

  const changeTripType = (t: TripType) => {
    const s0 = q.segments[0];
    if (t === "round_trip") {
      onChange({ ...q, trip_type: t, segments: [s0], return_date: q.return_date || plusDays(s0.date, 7) });
    } else {
      onChange({ ...q, trip_type: t, segments: [s0], return_date: null });
    }
  };

  const s0 = q.segments[0];
  const pax = paxCount(q);
  const ready = q.segments.every((s) => s.origins.length && s.destinations.length && s.date);
  const outTimes = s0.times;
  const today = isoDate(new Date());
  const extraCount = [q.max_duration_minutes, q.checked_bags || q.carry_on || q.exclude_basic_economy, q.max_price].filter(Boolean).length;

  return (
    <form
      className={clsx(!compact && "card card-pad")}
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) onSubmit?.();
      }}
    >
      {/* Row 1: trip type, passengers, cabin */}
      <div className="-ml-3 mb-4 flex flex-wrap items-center gap-1">
        <Select value={q.trip_type} options={tripLabels()} onChange={changeTripType} icon={<ArrowLeftRight size={16} />} />
        <Popover
          trigger={() => (
            <button type="button" className="btn-plain px-3" aria-label={t("common.passengers", { n: pax })}>
              <Users size={16} />
              <BtnLabel>{pax}</BtnLabel>
              <ChevronDown size={16} />
            </button>
          )}
        >
          {() => (
            <div className="space-y-3">
              {(
                [
                  ["adults", t("searchForm.adults"), t("searchForm.adultsSub"), t("searchForm.adultsStepper"), 1],
                  ["children", t("searchForm.children"), t("searchForm.childrenSub"), t("searchForm.childrenStepper"), 0],
                  ["infants_in_seat", t("searchForm.infants"), t("searchForm.inSeat"), t("searchForm.inSeatStepper"), 0],
                  ["infants_on_lap", t("searchForm.infants"), t("searchForm.onLap"), t("searchForm.onLapStepper"), 0],
                ] as const
              ).map(([k, l, sub, stepperLabel, min]) => (
                <div key={k} className="flex items-center justify-between gap-6">
                  <div>
                    <div className="text-sm font-medium">{l}</div>
                    <div className="text-sm text-ink-mute">{sub}</div>
                  </div>
                  <Stepper
                    label={stepperLabel}
                    value={q.passengers[k]}
                    min={min}
                    max={k === "infants_on_lap" ? q.passengers.adults : 9}
                    onChange={(v) => set({ passengers: { ...q.passengers, [k]: v } })}
                  />
                </div>
              ))}
            </div>
          )}
        </Popover>
        <Select value={q.cabin} options={cabinLabels()} onChange={(v: Cabin) => set({ cabin: v })} />
      </div>

      {/* Slices */}
      <div className="space-y-3">
        {q.segments.map((seg, i) => (
          <div key={i} className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
            <div className="relative flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-stretch">
              <PlaceInput value={seg.origins} onChange={(v) => setSeg(i, { origins: v })} placeholder={t("searchForm.from")} icon="origin" />
              <button
                type="button"
                title={t("searchForm.swap")}
                aria-label={t("searchForm.swap")}
                className="btn-outline btn-sm btn-icon-sm absolute right-3 top-[calc(50%-1.125rem)] z-10 rotate-90 rounded-full sm:static sm:rotate-0 sm:self-center"
                onClick={() => setSeg(i, { origins: seg.destinations, destinations: seg.origins })}
              >
                <ArrowLeftRight size={16} />
              </button>
              <PlaceInput value={seg.destinations} onChange={(v) => setSeg(i, { destinations: v })} placeholder={t("searchForm.to")} icon="destination" />
            </div>
            <div className="flex items-stretch gap-2">
              <div className="flex min-h-14 flex-1 items-stretch overflow-hidden rounded-lg border border-rule sm:flex-none">
                <input
                  type="date"
                  aria-label={q.trip_type === "round_trip" ? t("searchForm.departDate") : t("searchForm.date")}
                  className="min-w-0 flex-1 bg-white px-3 text-base outline-none sm:flex-none sm:text-sm"
                  value={seg.date}
                  min={today}
                  onChange={(e) => {
                    const d = e.target.value;
                    const patch: Partial<FlightQuery> = {};
                    if (q.trip_type === "round_trip" && q.return_date && d > q.return_date) {
                      patch.return_date = plusDays(d, q.return_date ? 7 : 0);
                    }
                    onChange({ ...q, ...patch, segments: q.segments.map((s, j) => (j === i ? { ...s, date: d } : s)) });
                  }}
                  required
                />
                {q.trip_type === "round_trip" && i === 0 && (
                  <input
                    type="date"
                    aria-label={t("searchForm.returnDate")}
                    className="min-w-0 flex-1 border-l border-rule bg-white px-3 text-base outline-none sm:flex-none sm:text-sm"
                    value={q.return_date || ""}
                    min={seg.date}
                    onChange={(e) => set({ return_date: e.target.value })}
                    required
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <FilterChip label={q.max_stops === "any" ? t("searchForm.stops") : stopsLabels()[q.max_stops]} active={q.max_stops !== "any"}>
          {(Object.entries(stopsLabels()) as [Stops, string][]).map(([k, stopsLabel]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="radio" className="accent-brand-600" checked={q.max_stops === k} onChange={() => set({ max_stops: k })} />
              {stopsLabel}
            </label>
          ))}
        </FilterChip>

        <FilterChip
          label={
            q.airlines.length
              ? t("searchForm.airlinesN", { n: q.airlines.length })
              : q.airlines_exclude.length
                ? t("searchForm.excludingN", { n: q.airlines_exclude.length })
                : t("searchForm.airlines")
          }
          active={!!(q.airlines.length || q.airlines_exclude.length)}
          wide
        >
          <div>
            <span className="label">{t("searchForm.alliances")}</span>
            <div className="flex flex-wrap gap-1">
              {(["STAR_ALLIANCE", "ONEWORLD", "SKYTEAM"] as const).map((a) => {
                const on = q.airlines.includes(a);
                return (
                  <button
                    key={a}
                    type="button"
                    className={clsx("chip", on && "chip-active")}
                    onClick={() => set({ airlines: on ? q.airlines.filter((x) => x !== a) : [...q.airlines, a] })}
                  >
                    <BtnLabel>{a === "STAR_ALLIANCE" ? "Star Alliance" : a === "ONEWORLD" ? "Oneworld" : "SkyTeam"}</BtnLabel>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <span className="label">{t("searchForm.onlyAirlines")}</span>
            <AirlineInput
              value={q.airlines.filter((a) => !ALLIANCES.includes(a))}
              onChange={(v) => set({ airlines: [...v, ...q.airlines.filter((a) => ALLIANCES.includes(a))] })}
            />
          </div>
          <div>
            <span className="label">{t("searchForm.excludeAirlines")}</span>
            <AirlineInput value={q.airlines_exclude} onChange={(v) => set({ airlines_exclude: v })} />
          </div>
        </FilterChip>

        <FilterChip label={t("searchForm.times")} active={timesActive(outTimes) || timesActive(q.return_times)} wide>
          <div className="text-sm font-semibold uppercase text-ink-mute">{q.trip_type === "round_trip" ? t("searchForm.outbound") : t("searchForm.firstLeg")}</div>
          <HourRange label={t("searchForm.departure")} from={outTimes?.departure_from} to={outTimes?.departure_to}
            onChange={(f, t) => setSeg(0, { times: { ...outTimes, departure_from: f, departure_to: t } })} />
          <HourRange label={t("searchForm.arrival")} from={outTimes?.arrival_from} to={outTimes?.arrival_to}
            onChange={(f, t) => setSeg(0, { times: { ...outTimes, arrival_from: f, arrival_to: t } })} />
          {q.trip_type === "round_trip" && (
            <>
              <div className="pt-2 text-sm font-semibold uppercase text-ink-mute">{t("searchForm.return")}</div>
              <HourRange label={t("searchForm.departure")} from={q.return_times?.departure_from} to={q.return_times?.departure_to}
                onChange={(f, t) => set({ return_times: { ...q.return_times, departure_from: f, departure_to: t } })} />
              <HourRange label={t("searchForm.arrival")} from={q.return_times?.arrival_from} to={q.return_times?.arrival_to}
                onChange={(f, t) => set({ return_times: { ...q.return_times, arrival_from: f, arrival_to: t } })} />
            </>
          )}
        </FilterChip>

        <FilterChip label={extraCount ? t("searchForm.moreN", { n: extraCount }) : t("searchForm.more")} active={extraCount > 0} wide>
          <div>
            <div className="flex justify-between text-sm">
              <span className="font-semibold">{t("searchForm.maxDuration")}</span>
              <span className="text-ink-mute">{q.max_duration_minutes ? t("format.h", { h: Math.round(q.max_duration_minutes / 60) }) : t("searchForm.any")}</span>
            </div>
            <input
              type="range" min={1} max={48} className="w-full accent-brand-600" aria-label={t("searchForm.maxDurationAria")}
              value={q.max_duration_minutes ? Math.round(q.max_duration_minutes / 60) : 48}
              onChange={(e) => set({ max_duration_minutes: +e.target.value >= 48 ? null : +e.target.value * 60 })}
            />
          </div>
          <div className="space-y-2 border-t border-rule pt-3">
            <div className="text-sm font-semibold">{t("searchForm.bags")}</div>
            <div className="flex items-center justify-between text-sm">
              <span>{t("searchForm.carryOn")}</span>
              <Toggle checked={q.carry_on} onChange={(v) => set({ carry_on: v })} label={<span className="sr-only">{t("searchForm.carryOnSr")}</span>} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t("searchForm.checkedBags")}</span>
              <Stepper label={t("searchForm.checkedBagsStepper")} value={q.checked_bags} max={2} onChange={(v) => set({ checked_bags: v })} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span>{t("searchForm.excludeBasic")}</span>
              <Toggle checked={q.exclude_basic_economy} onChange={(v) => set({ exclude_basic_economy: v })} label={<span className="sr-only">{t("searchForm.excludeBasic")}</span>} />
            </div>
          </div>
          <div className="border-t border-rule pt-3">
            <label className="label" htmlFor="ff-max-price">{t("searchForm.maxPrice")}</label>
            <input
              id="ff-max-price" type="number" min={1} className="input" placeholder={t("searchForm.noLimit")}
              value={q.max_price ?? ""}
              onChange={(e) => set({ max_price: e.target.value ? +e.target.value : null })}
            />
          </div>
        </FilterChip>

        <div className="ml-auto flex items-center gap-2">
          {onSubmit && (
            <Button type="submit" variant="primary" className="px-6" disabled={!ready || loading} loading={loading} icon={<Search size={18} />}>
              {submitLabel}
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

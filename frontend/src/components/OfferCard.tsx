import clsx from "clsx";
import { ChevronDown, Clock, ExternalLink, Leaf, Moon } from "lucide-react";
import { useState } from "react";
import { t } from "../i18n";
import type { Offer, Slice, TripType } from "../lib/api";
import { dayDiff, duration, money, shortDate, stopsText, time } from "../lib/format";

function AirlineLogo({ code, name }: { code: string; name?: string }) {
  const [err, setErr] = useState(false);
  if (err || !code) {
    const txt = code || (name ?? "").split(/,\s*/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
    return (
      <div aria-hidden className="denom grid h-8 w-8 place-items-center rounded bg-brand-50 text-sm text-brand-700">
        {txt || "?"}
      </div>
    );
  }
  return (
    <img
      src={`https://www.gstatic.com/flights/airline_logos/70px/${code}.png`}
      alt={code}
      className="h-8 w-8 object-contain"
      onError={() => setErr(true)}
      loading="lazy"
    />
  );
}

function SliceRow({ s, label }: { s: Slice; label?: string }) {
  const plus = dayDiff(s.departure.slice(0, 10), s.arrival.slice(0, 10));
  return (
    <div className="grid grid-cols-[2.5rem_1fr] items-center gap-3 sm:grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)]">
      <AirlineLogo code={s.airlines.length > 1 ? "" : s.legs[0].airline_code} name={s.airlines.join(", ")} />
      <div className="min-w-0">
        {label && <div className="text-sm font-semibold text-ink-mute">{label}</div>}
        <div className="whitespace-nowrap text-base font-semibold tnum">
          {time(s.departure)} – {time(s.arrival)}
          {plus > 0 && <span className="ml-1 align-top text-sm font-semibold text-bad" title={t("offer.nextDay")}>+{plus}</span>}
        </div>
        <div className="truncate text-sm text-ink-mute">{s.airlines.join(", ")}</div>
        <div className="mt-0.5 text-sm text-ink-soft sm:hidden">
          {stopsText(s.stops)} · {duration(s.duration)}
        </div>
      </div>
      <div className="hidden sm:block">
        <div className="text-sm">{duration(s.duration)}</div>
        <div className="text-sm text-ink-mute">
          {s.origin}–{s.destination}
        </div>
      </div>
      <div className="hidden sm:block">
        <div className="text-sm">{stopsText(s.stops)}</div>
        <div className="truncate text-sm text-ink-mute">
          {s.layovers.map((l) => `${duration(l.duration)} ${l.airport}`).join(", ")}
        </div>
      </div>
    </div>
  );
}

function SliceDetail({ s }: { s: Slice }) {
  return (
    <div className="space-y-1">
      <div className="mb-2 text-sm font-semibold">
        {shortDate(s.departure)} · {s.origin} → {s.destination}
      </div>
      {s.legs.map((l, i) => (
        <div key={i}>
          <div className="relative border-l-2 border-dotted border-rule py-1 pl-5">
            <span className="absolute -left-[7px] top-2 h-3 w-3 rounded-full border-2 border-ink-mute bg-white" />
            <div className="text-sm font-medium">
              {time(l.departure)} · {l.origin_name ?? l.origin} ({l.origin})
            </div>
            <div className="py-2 text-sm text-ink-mute">{t("offer.travelTime", { duration: duration(l.duration) })}</div>
            <span className="absolute -left-[7px] bottom-2 h-3 w-3 rounded-full border-2 border-ink-mute bg-white" />
            <div className="text-sm font-medium">
              {time(l.arrival)} · {l.destination_name ?? l.destination} ({l.destination})
            </div>
            <div className="mt-1 text-sm text-ink-mute">
              {l.airline_name}{l.flight_number && ` · ${l.airline_code} ${l.flight_number}`}
              {l.aircraft && ` · ${l.aircraft}`}
              {l.legroom && t("offer.legroom", { legroom: l.legroom })}
            </div>
          </div>
          {s.layovers[i] && (
            <div className="my-2 flex items-center gap-2 border-y border-rule py-2 text-sm text-ink-soft">
              <Clock size={14} />
              {t("offer.layover", {
                duration: duration(s.layovers[i].duration),
                city: s.layovers[i].city ? `${s.layovers[i].city} ` : "",
                airport: s.layovers[i].airport,
              })}
              {s.layovers[i].overnight && (
                <span className="inline-flex items-center gap-1 text-bad">
                  <Moon size={12} /> {t("offer.overnight")}
                </span>
              )}
              {s.layovers[i].change_of_airport && <span className="text-bad">{t("offer.changeAirport")}</span>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function OfferCard({
  offer,
  best,
  cheapest,
  tripType,
  flat,
}: {
  offer: Offer;
  best?: boolean;
  cheapest?: boolean;
  tripType?: TripType;
  /** Row inside a list card (no card of its own). */
  flat?: boolean;
}) {
  const priceLabel = (tripType ?? (offer.slices.length > 1 ? "round_trip" : "one_way")) === "one_way" ? t("common.oneWay") : t("common.roundTrip");
  const [open, setOpen] = useState(false);
  const partial = tripType === "round_trip" && offer.slices.length === 1;
  const labels = partial
    ? [t("offer.outboundPartial")]
    : offer.slices.length === 2
      ? [t("offer.outbound"), t("offer.return")]
      : offer.slices.length > 2
        ? offer.slices.map((_, i) => t("offer.leg", { n: i + 1 }))
        : [];
  return (
    <div className={clsx(flat ? "overflow-hidden" : "card overflow-hidden", open && !flat && "ring-1 ring-brand-200")}>
      <button
        type="button"
        aria-expanded={open}
        className="card-px flex w-full items-center gap-3 py-4 text-left hover:bg-brand-50 sm:gap-4"
        onClick={() => setOpen(!open)}
      >
        <div className="min-w-0 flex-1 space-y-3">
          {offer.slices.map((s, i) => (
            <SliceRow key={i} s={s} label={labels[i]} />
          ))}
        </div>
        <div className="w-24 shrink-0 text-right sm:w-28">
          <div className={clsx("denom text-[1.5rem]", cheapest ? "text-good" : "text-ink")}>{money(offer.price, offer.currency)}</div>
          <div className="text-sm text-ink-mute">{priceLabel}</div>
          {best && <div className="mt-1.5 inline-block rounded bg-brand-50 px-2 py-1 text-sm leading-none font-semibold text-brand-700">{t("offer.best")}</div>}
          {offer.emissions_tag === "lower" && (
            <div className="mt-1 flex items-center justify-end gap-1 text-sm text-good">
              <Leaf size={11} /> {t("offer.lowerCo2")}
            </div>
          )}
        </div>
        <ChevronDown size={20} className={clsx("shrink-0 text-ink-mute transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="card-px grid gap-6 border-t border-rule py-4 md:grid-cols-2">
          {offer.slices.map((s, i) => (
            <SliceDetail key={i} s={s} />
          ))}
          {!!offer.links?.length && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-4 md:col-span-2">
              <span className="text-sm font-semibold text-ink-mute">{t("offer.seeOn")}</span>
              {offer.links.map((l) => (
                <a
                  key={l.id}
                  href={l.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
                  aria-label={t("common.opensNewTab", { name: l.name })}
                >
                  {l.name}
                  <ExternalLink size={13} aria-hidden />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

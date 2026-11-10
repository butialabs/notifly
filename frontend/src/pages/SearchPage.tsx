import { useMutation, useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { BellPlus, ExternalLink, FolderPlus, Plane } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { OverflowMenu } from "../components/Menu";
import { OfferCard } from "../components/OfferCard";
import { type SaveMode, SaveWatchModal } from "../components/SaveWatchModal";
import { defaultQuery, SearchForm } from "../components/SearchForm";
import { Button, Empty, ErrorBox, Spinner } from "../components/ui";
import { t } from "../i18n";
import { api, type FlightQuery } from "../lib/api";
import { money } from "../lib/format";

const KEY = "ff:lastQuery";

export function routeLabel(q: FlightQuery) {
  const s0 = q.segments[0];
  const o = s0.origins.join("/") || "?";
  const d = s0.destinations.join("/") || "?";
  if (q.trip_type === "round_trip") return `${o} ⇄ ${d}`;
  return `${o} → ${d}`;
}

function loadQuery(): FlightQuery {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const q = JSON.parse(raw) as FlightQuery;
      const today = new Date().toISOString().slice(0, 10);
      if (q.segments[0].date >= today) {
        const tripType = q.trip_type === "round_trip" ? "round_trip" : "one_way";
        return { ...defaultQuery(), ...q, trip_type: tripType, segments: q.segments.slice(0, 1) };
      }
    }
  } catch {
    /* ignore */
  }
  return defaultQuery();
}

export function SearchPage() {
  const [params] = useSearchParams();
  const tripId = params.get("trip") ? Number(params.get("trip")) : undefined;
  const [query, setQuery] = useState<FlightQuery>(loadQuery);
  const [submitted, setSubmitted] = useState<FlightQuery | null>(null);
  const [tab, setTab] = useState<"best" | "cheapest">("best");
  const [saveMode, setSaveMode] = useState<SaveMode | null>(null);
  const { data: trips = [] } = useQuery({ queryKey: ["trips"], queryFn: () => api.trips() });
  const search = useMutation({ mutationFn: api.search });

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(query));
    } catch {
      /* ignore */
    }
  }, [query]);

  const run = (q = query) => {
    setSubmitted(q);
    search.mutate(q);
  };

  const offers = useMemo(() => {
    const list = search.data?.offers ?? [];
    if (tab === "cheapest") return [...list].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    return list;
  }, [search.data, tab]);
  const minPrice = search.data?.min_price;

  return (
    <div className="page-stack">
      <div>
        <h1 className="denom text-[1.75rem] leading-none text-ink sm:text-[2.25rem]">{t("search.title")}</h1>
        {!submitted && <p className="mt-2 text-ink-soft">{t("search.intro")}</p>}
      </div>
      <SearchForm value={query} onChange={setQuery} onSubmit={() => run()} loading={search.isPending} />

      {submitted && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex overflow-hidden rounded-xl border border-rule">
              {(
                [
                  ["best", t("search.best")],
                  ["cheapest", t("search.cheapest")],
                ] as const
              ).map(([k, l]) => (
                <button
                  key={k}
                  className={clsx(
                    "inline-flex min-h-10 items-center px-4 text-sm leading-none",
                    tab === k ? "bg-brand-50 font-medium text-brand-700" : "hover:bg-brand-50",
                  )}
                  onClick={() => setTab(k)}
                >
                  {l}
                  {k === "cheapest" && minPrice != null && <span className="ml-2 text-good">{money(minPrice, search.data?.currency)}</span>}
                </button>
              ))}
            </div>
            {search.data && (
              <span className="text-sm text-ink-mute">
                {t("common.results", { n: search.data.count })} · {t("search.elapsed", { s: (search.data.elapsed_ms / 1000).toFixed(1) })}
              </span>
            )}
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              {search.data && (
                <Button href={search.data.google_flights_url} target="_blank" rel="noreferrer" icon={<ExternalLink size={16} />}>
                  Google Flights
                </Button>
              )}
              {search.data?.links && search.data.links.length > 1 && (
                <OverflowMenu
                  label={t("search.otherSites")}
                  items={search.data.links
                    .filter((l) => l.id !== "google")
                    .map((l) => ({
                      label: t("common.openIn", { name: l.name }),
                      icon: <ExternalLink size={16} />,
                      onSelect: () => window.open(l.url, "_blank", "noopener,noreferrer"),
                    }))}
                />
              )}
              {tripId ? (
                <Button variant="primary" icon={<FolderPlus size={16} />} onClick={() => setSaveMode("existing")} disabled={!search.data}>
                  {t("search.addToThisTrip")}
                </Button>
              ) : (
                <>
                  <Button
                    onClick={() => setSaveMode("existing")}
                    disabled={!search.data || trips.length === 0}
                    title={trips.length === 0 ? t("search.noTrips") : undefined}
                    icon={<FolderPlus size={16} />}
                    >
                      {t("search.addToTrip")}
                    </Button>
                  <Button variant="primary" icon={<BellPlus size={16} />} onClick={() => setSaveMode("new")} disabled={!search.data}>
                    {t("search.createTrip")}
                  </Button>
                </>
              )}
            </div>
          </div>

          <ErrorBox error={search.error} />
          {search.isPending && (
            <div className="flex items-center justify-center gap-2 py-16 text-ink-mute">
              <Spinner /> {t("search.searching")}
            </div>
          )}
          {search.data && !search.isPending && offers.length === 0 && (
            <Empty icon={<Plane size={36} />} title={t("search.emptyTitle")}>
              {t("search.emptyBody")}
            </Empty>
          )}
          {!search.isPending && (
            <div className="space-y-2">
              {offers.map((o, i) => (
                <OfferCard key={i} offer={o} best={tab === "best" && i < 3} cheapest={o.price === minPrice} tripType={submitted.trip_type} />
              ))}
            </div>
          )}
          <SaveWatchModal
            open={saveMode !== null}
            mode={saveMode ?? "new"}
            onClose={() => setSaveMode(null)}
            query={submitted}
            defaultTripId={tripId}
            routeLabel={routeLabel(submitted)}
          />
        </>
      )}
    </div>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Copy, ExternalLink, Pause, Pencil, Play, RefreshCw, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { PriceHistoryChart } from "../components/Charts";
import { OverflowMenu } from "../components/Menu";
import { OfferCard } from "../components/OfferCard";
import { Postmark, postmarkKind } from "../components/Postmark";
import { RulesPanel } from "../components/RulesPanel";
import { StampSheet, TripStamp } from "../components/Stamps";
import { BtnLabel, Button, ErrorBox, Modal, Spinner } from "../components/ui";
import { WatchEditor } from "../components/WatchEditor";
import { t } from "../i18n";
import { api, ApiError, type Watch } from "../lib/api";
import { dateTime, intervalText, isRuleKind, money, paxCount, querySummary, relative, ruleLabel } from "../lib/format";
import { verdictFor } from "../lib/verdict";

function Delta({ label, cur, base, currency }: { label: string; cur?: number | null; base?: number | null; currency?: string | null }) {
  if (cur == null || base == null) return null;
  const diff = cur - base;
  const pct = base ? (Math.abs(diff) / base) * 100 : 0;
  return (
    <div className="min-w-0">
      <div className="label-caps">{label}</div>
      <div
        className={clsx(
          "mt-0.5 flex items-center gap-1 text-sm font-semibold tnum",
          diff < 0 ? "text-good" : diff > 0 ? "text-bad" : "text-ink-soft",
        )}
      >
        {diff < 0 ? <ArrowDown size={14} /> : diff > 0 ? <ArrowUp size={14} /> : null}
        {diff === 0 ? t("watch.same") : `${money(Math.abs(diff), currency)} (${pct.toFixed(1)}%)`}
      </div>
      <div className="text-sm text-ink-mute tnum">{money(base, currency)}</div>
    </div>
  );
}

function priceScope(w: Watch) {
  const pax = paxCount(w.query);
  const trip = w.query.trip_type === "round_trip" ? t("common.roundTrip") : t("common.oneWay");
  return t("watch.priceScope", { trip, pax: t("common.passengers", { n: pax }) });
}

export function WatchPage() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const { data: w, error, isLoading, refetch } = useQuery({ queryKey: ["watch", id], queryFn: () => api.watch(id), refetchInterval: 30_000 });
  const { data: history = [] } = useQuery({ queryKey: ["history", id], queryFn: () => api.history(id), refetchInterval: 60_000 });
  const { data: latest } = useQuery({ queryKey: ["latest", id], queryFn: () => api.latest(id), refetchInterval: 60_000 });

  const refresh = () => {
    for (const k of ["watch", "history", "latest", "trip", "trips", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const check = useMutation({ mutationFn: () => api.checkWatch(id), onSuccess: refresh });
  const update = useMutation({
    mutationFn: (d: Parameters<typeof api.updateWatch>[1]) => api.updateWatch(id, d),
    onSuccess: () => {
      refresh();
      setEditing(false);
    },
  });
  // The copy is only created on save, so cancelling leaves no stray flight and spends no search.
  const dup = useMutation({
    mutationFn: (d: Parameters<typeof api.createWatch>[1]) => api.createWatch(w!.trip_id, d),
    onSuccess: (created) => {
      refresh();
      setDuplicating(false);
      nav(`/watches/${created.id}`);
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteWatch(id),
    onSuccess: () => {
      refresh();
      nav(w ? `/trips/${w.trip_id}` : "/");
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !w)
    return (
      <div className="flex flex-col gap-3">
        <ErrorBox
          error={!error || (error instanceof ApiError && error.status === 404) ? t("watch.notFound") : error}
          onRetry={error && !(error instanceof ApiError && error.status === 404) ? () => refetch() : undefined}
        />
        <Link to="/" className="btn-outline self-start">
          <BtnLabel>{t("common.backToTrips")}</BtnLabel>
        </Link>
      </div>
    );

  const v = verdictFor(w);
  const lastOk = [...history].reverse().find((h) => h.ok);
  const mark = postmarkKind({
    checked: !!w.last_checked_at,
    ok: !w.last_error || w.last_price != null,
  });
  const firedNow = !!(w.last_alert && w.last_checked_at && w.last_alert.created_at >= w.last_checked_at);
  const firedRule = w.applicable_rules?.find((r) => r.id === w.last_alert?.rule_id);
  const pricedPoints = history.filter((h) => h.min_price != null);
  const allSame =
    w.last_price != null && [w.previous_price, w.lowest_price, w.highest_price].every((x) => x == null || x === w.last_price);

  const actions = [
    {
      label: check.isPending ? t("watch.checking") : t("watch.checkNow"),
      icon: <RefreshCw size={16} />,
      hint: t("watch.checkHint"),
      disabled: check.isPending,
      onSelect: () => check.mutate(),
    },
    { label: t("watch.editSearch"), icon: <Pencil size={16} />, onSelect: () => setEditing(true) },
    {
      label: t("watch.duplicate"),
      icon: <Copy size={16} />,
      hint: t("watch.duplicateHint"),
      onSelect: () => {
        dup.reset();
        setDuplicating(true);
      },
    },
    {
      label: t("watch.openSearch"),
      icon: <Search size={16} />,
      hint: t("watch.openSearchHint"),
      onSelect: () => {
        sessionStorage.setItem("ff:lastQuery", JSON.stringify(w.query));
        nav(`/search?trip=${w.trip_id}`);
      },
    },
    ...(w.links ?? [])
      .filter((l) => l.id !== "google")
      .map((l) => ({
        label: t("common.openIn", { name: l.name }),
        icon: <ExternalLink size={16} />,
        onSelect: () => window.open(l.url, "_blank", "noopener,noreferrer"),
      })),
    w.active
      ? { label: t("watch.pause"), icon: <Pause size={16} />, onSelect: () => update.mutate({ active: false }) }
      : { label: t("watch.resume"), icon: <Play size={16} />, onSelect: () => update.mutate({ active: true }) },
    {
      label: t("watch.delete"),
      icon: <Trash2 size={16} />,
      danger: true,
      onSelect: () => window.confirm(t("watch.confirmDelete")) && del.mutate(),
    },
  ];

  return (
    <div className="page-stack pb-24 sm:pb-0">
      {/* Breadcrumb: trip › flight */}
      <div className="sticky top-16 z-10 -mx-4 border-b border-rule bg-paper/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          {w.trip && <TripStamp id={w.trip.id} emoji={w.trip.emoji} size={30} />}
          <nav aria-label={t("watch.breadcrumb")} className="min-w-0 flex-1 truncate text-sm">
            {w.trip && (
              <Link to={`/trips/${w.trip.id}`} className="font-semibold text-ink-soft hover:text-brand-600 hover:underline">
                {w.trip.name}
              </Link>
            )}
            <span className="mx-1.5 text-ink-mute">›</span>
            <span className="font-bold text-ink">
              {w.route}
              {w.label && <span className="font-medium text-ink-soft"> · {w.label}</span>}
            </span>
          </nav>
          <span className={clsx("hidden shrink-0 text-sm font-semibold sm:inline", w.active ? "text-ink-soft" : "text-warn")}>
            {w.active
              ? t("watch.checksEvery", { interval: intervalText(w.check_interval_minutes) }) +
                (w.next_check_at ? t("watch.nextSuffix", { when: relative(w.next_check_at) }) : "")
              : t("watch.paused")}
          </span>
        </div>
      </div>

      {/* Verdict */}
      <section aria-labelledby="verdict" className="card relative overflow-hidden">
        {firedNow && <div className="airmail-stripe h-2" aria-hidden />}
        <div className="card-pad grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:gap-8">
          <div className="relative min-w-0">
            <div className="relative mt-10 inline-block pr-16 sm:mt-4">
              <div className="denom text-[clamp(4rem,13vw,7.5rem)] text-ink">{money(w.last_price, w.currency)}</div>
              <Postmark
                key={`m-${w.last_checked_at ?? "none"}`}
                at={w.last_checked_at}
                kind={mark}
                size={96}
                rotate={-14}
                strike
                className="absolute -right-3 -top-12 w-[76px] sm:-right-10 sm:-top-6 sm:w-auto lg:hidden"
              />
              <Postmark
                key={`d-${w.last_checked_at ?? "none"}`}
                at={w.last_checked_at}
                kind={mark}
                size={96}
                rotate={-8}
                waves
                strike
                className="absolute -top-7 left-[calc(100%-4.5rem)] hidden lg:block"
              />
            </div>
            <p className="mt-2 text-sm font-semibold text-ink-soft">{priceScope(w)}</p>
            <p className="text-sm text-ink-soft">{querySummary(w.query)}</p>
            {allSame ? (
              <p className="mt-5 max-w-md border-t border-rule pt-4 text-sm text-ink-soft">
                {t("watch.allSame")}
              </p>
            ) : (
              <div className="mt-5 grid max-w-md grid-cols-3 gap-4 border-t border-rule pt-4">
                <Delta label={t("watch.vsPrevious")} cur={w.last_price} base={w.previous_price} currency={w.currency} />
                <Delta label={t("watch.vsLowest")} cur={w.last_price} base={w.lowest_price} currency={w.currency} />
                <Delta label={t("watch.vsHighest")} cur={w.last_price} base={w.highest_price} currency={w.currency} />
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-col">
            <h1
              id="verdict"
              className={clsx(
                "denom mt-1 text-[clamp(3rem,8vw,4.75rem)] uppercase",
                v.kind === "buy" ? "text-good" : v.kind === "wait" ? "text-ink" : "text-ink-mute",
              )}
            >
              {v.word}
            </h1>
            <p className="mt-2 max-w-prose text-base text-ink">
              <span className="font-semibold">{t("watch.byYourRules")}</span> {v.reason}
            </p>
            {w.last_alert && (
              <p className="mt-3 text-sm text-ink-soft">
                <span className="font-semibold text-ink">{t("watch.alertFired", { when: relative(w.last_alert.created_at) })}</span>{" "}
                {firedRule
                  ? `${ruleLabel(firedRule.kind)}${firedRule.threshold ? ` (${money(firedRule.threshold, w.currency)})` : ""}`
                  : w.last_alert.kind
                    ? isRuleKind(w.last_alert.kind)
                      ? ruleLabel(w.last_alert.kind)
                      : undefined
                    : w.last_alert.title}
                {!w.last_alert.ok && <span className="text-danger">{t("watch.sendFailed")}</span>}
              </p>
            )}
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-6">
              <Button
                variant="primary"
                size="lg"
                className="hidden sm:inline-flex"
                href={w.google_flights_url}
                target="_blank"
                rel="noreferrer"
                aria-label={t("watch.buyAria")}
                iconRight={<ExternalLink size={16} />}
                >
                {t("watch.buy")}
                </Button>
              <OverflowMenu items={actions} label={t("watch.moreActions")} />
            </div>
          </div>
        </div>

        {w.last_error && (
          <div className="card-px border-t border-rule bg-warn-soft py-4 text-sm text-ink">
            <span className="font-bold">{t("watch.lastErrorTitle")}</span> {w.last_error}{" "}
            {w.last_price != null && t("watch.previousPrice", { when: relative(lastOk?.checked_at) })}
          </div>
        )}
        {check.error && (
          <div className="card-px border-t border-rule py-4">
            <ErrorBox error={check.error} />
          </div>
        )}
      </section>

      {/* History */}
      <section aria-labelledby="hist" className="card card-pad">
        <div className="section-head">
          <h2 id="hist" className="section-title">
            {t("watch.history")}
          </h2>
          <span className="text-sm text-ink-mute tnum">
            {t("watch.checks", { n: history.length })}
            {w.lowest_price_at && t("watch.lowestAt", { date: dateTime(w.lowest_price_at) })}
          </span>
        </div>
        {pricedPoints.length === 0 ? (
          <p className="text-sm text-ink-soft">{t("watch.noPrices")}</p>
        ) : (
          <>
            <StampSheet points={history} currency={w.currency} lowest={w.lowest_price} />
            {pricedPoints.length >= 3 ? (
              <div className="mt-4">
                <PriceHistoryChart data={history} currency={w.currency} lowest={w.lowest_price} height={180} />
              </div>
            ) : (
              <p className="mt-3 text-sm text-ink-soft">
                {t("watch.notEnough", { n: pricedPoints.length })}
              </p>
            )}
          </>
        )}
      </section>

      <RulesPanel
        scope={{ watch_id: w.id }}
        currency={w.currency}
        title={t("watch.rulesTitle")}
        hint={
          w.applicable_rules?.some((r) => r.scope !== "watch")
            ? (() => {
                const n = w.applicable_rules!.filter((r) => r.scope !== "watch").length;
                return t("watch.tripRulesAlso", { n });
              })()
            : t("watch.tripRulesApply")
        }
      />

      {/* Offers */}
      <section aria-labelledby="offers" className="card overflow-hidden">
        <div className="card-head">
          <h2 id="offers" className="section-title">
            {t("watch.offers")}
          </h2>
          {latest && (
            <span className="text-sm text-ink-mute tnum">
              {dateTime(latest.checked_at)} · {t("common.results", { n: latest.result_count })}
            </span>
          )}
        </div>
        <div className="divide-y divide-rule">
          {(latest?.offers ?? []).map((o, i) => (
            <OfferCard key={i} flat offer={o} cheapest={o.price === latest?.min_price} tripType={w.query.trip_type} />
          ))}
          {!latest && <p className="card-row text-sm text-ink-soft">{t("watch.noChecks")}</p>}
        </div>
      </section>

      {/* Sticky buy bar on mobile */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-rule bg-white/95 px-4 pt-3 backdrop-blur-sm sm:hidden"
        style={{ boxShadow: "var(--shadow-pop)", paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0">
            <div className="denom text-3xl">{money(w.last_price, w.currency)}</div>
            <div className={clsx("text-sm font-bold uppercase", v.kind === "buy" ? "text-good" : "text-ink-soft")}>{v.word}</div>
          </div>
          <Button
            variant="primary"
            size="lg"
            className="ml-auto"
            href={w.google_flights_url}
            target="_blank"
            rel="noreferrer"
            aria-label={t("watch.buyAria")}
            iconRight={<ExternalLink size={16} />}
            >
            {t("watch.buy")}
            </Button>
        </div>
      </div>

      <Modal open={editing} onClose={() => setEditing(false)} title={t("watch.editModal")} wide>
        <p className="mb-3 text-sm text-warn">{t("watch.editWarning")}</p>
        <WatchEditor
          initial={{ query: w.query, label: w.label ?? null, check_interval_minutes: w.check_interval_minutes }}
          submitLabel={t("common.save")}
          pending={update.isPending}
          error={update.error}
          onCancel={() => setEditing(false)}
          onSubmit={(d) => {
            const changed = JSON.stringify(d.query) !== JSON.stringify(w.query);
            update.mutate({ label: d.label, check_interval_minutes: d.check_interval_minutes, ...(changed ? { query: d.query } : {}) });
          }}
        />
      </Modal>

      <Modal open={duplicating} onClose={() => setDuplicating(false)} title={t("watch.duplicateModal")} wide>
        <p className="mb-3 text-sm text-ink-soft">
          {t("watch.duplicateBefore")} <span className="font-semibold text-ink">{w.trip?.name ?? t("watch.duplicateSameTrip")}</span>{" "}
          {t("watch.duplicateAfter")}
        </p>
        <WatchEditor
          initial={{ query: w.query, label: w.label ?? null, check_interval_minutes: w.check_interval_minutes }}
          submitLabel={t("watch.duplicateSubmit")}
          pending={dup.isPending}
          error={dup.error}
          onCancel={() => setDuplicating(false)}
          onSubmit={(d) => dup.mutate(d)}
        />
      </Modal>
    </div>
  );
}

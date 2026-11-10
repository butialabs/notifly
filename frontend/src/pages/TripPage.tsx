import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { AlertTriangle, Archive, ArchiveRestore, ArrowDown, ArrowUp, Pause, Pencil, Plane, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Postmark, postmarkKind } from "../components/Postmark";
import { TripStamp } from "../components/Stamps";
import { OverflowMenu } from "../components/Menu";
import { RulesPanel } from "../components/RulesPanel";
import { BtnLabel, Button, Empty, ErrorBox, Modal, Spinner, Toggle } from "../components/ui";
import { verdictFor } from "../lib/verdict";
import { WatchEditor } from "../components/WatchEditor";
import { t } from "../i18n";
import { api, ApiError, type Watch } from "../lib/api";
import { money, querySummary, relative } from "../lib/format";
import { TripForm } from "./TripsPage";

export function PriceDelta({ current, previous, currency }: { current?: number | null; previous?: number | null; currency?: string | null }) {
  if (current == null || previous == null || current === previous) return null;
  const down = current < previous;
  const pct = (Math.abs(current - previous) / previous) * 100;
  return (
    <span className={clsx("inline-flex items-center gap-0.5 text-sm font-semibold tnum", down ? "text-good" : "text-bad")}>
      {down ? <ArrowDown size={12} /> : <ArrowUp size={12} />}
      {money(Math.abs(current - previous), currency)} ({pct.toFixed(1)}%)
    </span>
  );
}

function WatchRow({ w }: { w: Watch }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: (active: boolean) => api.updateWatch(w.id, { active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["trip"] }),
  });
  const v = verdictFor(w);
  const fired = !!(w.last_alert && w.last_checked_at && w.last_alert.created_at >= w.last_checked_at);
  const mark = postmarkKind({ checked: !!w.last_checked_at, ok: !w.last_error || w.last_price != null });
  return (
    <div className={clsx("card-row relative flex flex-wrap items-center gap-x-6 gap-y-3", !w.active && "opacity-70")}>
      {fired && <div className="airmail-stripe absolute inset-x-0 top-0 h-1" aria-hidden />}
      <Link to={`/watches/${w.id}`} className="group min-w-0 flex-1 basis-64">
        <div className="flex items-center gap-2 text-base font-bold group-hover:text-brand-600">
          <Plane size={16} className="text-ink-mute" /> {w.route}
          {w.label && <span className="font-medium text-ink-soft">· {w.label}</span>}
          {fired && <span className="rounded bg-airmail px-2 py-0.5 text-sm font-bold text-white">{t("trip.alertArrived")}</span>}
        </div>
        <div className="mt-0.5 text-sm text-ink-soft">{querySummary(w.query)}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-ink-mute">
          {w.last_error ? (
            <span className="inline-flex items-center gap-1 font-semibold text-warn">
              <AlertTriangle size={12} /> {t("trip.returnedByGoogle")}
            </span>
          ) : (
            <span>{t("trip.checked", { when: relative(w.last_checked_at) })}</span>
          )}
          {w.active && w.next_check_at && <span>{t("trip.next", { when: relative(w.next_check_at) })}</span>}
          {!w.active && (
            <span className="inline-flex items-center gap-1 font-semibold text-warn">
              <Pause size={12} /> {t("trip.paused")}
            </span>
          )}
        </div>
      </Link>
      <Postmark at={w.last_checked_at} kind={mark} size={52} rotate={-10} className="hidden sm:block" />
      <Link to={`/watches/${w.id}`} className="ml-auto text-right sm:w-40">
        <div className="denom text-[2rem] text-ink">{money(w.last_price, w.currency)}</div>
        <div className="mt-1 flex items-center justify-end gap-2 text-sm">
          <span className={clsx("font-bold uppercase", v.kind === "buy" ? "text-good" : "text-ink-soft")}>{v.word}</span>
          <PriceDelta current={w.last_price} previous={w.previous_price} currency={w.currency} />
        </div>
      </Link>
      <Toggle checked={w.active} onChange={(val) => toggle.mutate(val)} label={<span className="sr-only">{t("trip.monitor", { route: w.route })}</span>} />
    </div>
  );
}

export function TripPage() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(false);
  const { data: trip, isLoading, error, refetch } = useQuery({
    queryKey: ["trip", id],
    queryFn: () => api.trip(id),
    refetchInterval: 30_000,
  });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["trip"] });
    qc.invalidateQueries({ queryKey: ["trips"] });
  };
  const addWatch = useMutation({
    mutationFn: (d: Parameters<typeof api.createWatch>[1]) => api.createWatch(id, d),
    onSuccess: () => {
      invalidate();
      setAdding(false);
    },
  });
  const update = useMutation({
    mutationFn: (d: Parameters<typeof api.updateTrip>[1]) => api.updateTrip(id, d),
    onSuccess: () => {
      invalidate();
      setEditing(false);
    },
  });
  const del = useMutation({
    mutationFn: () => api.deleteTrip(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      nav("/");
    },
  });

  if (isLoading) return <Spinner />;
  if (error || !trip)
    return (
      <div className="flex flex-col gap-3">
        <ErrorBox
          error={!error || (error instanceof ApiError && error.status === 404) ? t("trip.notFound") : error}
          onRetry={error && !(error instanceof ApiError && error.status === 404) ? () => refetch() : undefined}
        />
        <Link to="/" className="btn-outline self-start">
          <BtnLabel>{t("common.backToTrips")}</BtnLabel>
        </Link>
      </div>
    );
  const watches = trip.watches ?? [];

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-start gap-4">
        <TripStamp id={trip.id} emoji={trip.emoji} size={48} />
        <div className="min-w-0 flex-1">
          <Link to="/" className="text-sm font-semibold text-ink-soft hover:text-brand-600 hover:underline">
            {t("trip.back")}
          </Link>
          <h1 className="denom mt-1 break-words text-[1.75rem] leading-none text-ink sm:text-[2.25rem]">{trip.name}</h1>
          {trip.description && <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{trip.description}</p>}
        </div>
        <div className="flex basis-full justify-end gap-2 sm:basis-auto">
          <Button icon={<Pencil size={16} />} onClick={() => setEditing(true)}>
            {t("common.edit")}
          </Button>
          <OverflowMenu
            label={t("trip.moreActions")}
            items={[
              trip.archived
                ? { label: t("trip.unarchive"), icon: <ArchiveRestore size={16} />, hint: t("trip.unarchiveHint"), onSelect: () => update.mutate({ archived: false }) }
                : { label: t("trip.archive"), icon: <Archive size={16} />, hint: t("trip.archiveHint"), onSelect: () => update.mutate({ archived: true }) },
              {
                label: t("trip.delete"),
                icon: <Trash2 size={16} />,
                danger: true,
                hint: t("trip.deleteHint"),
                onSelect: () => {
                  if (window.confirm(t("trip.confirmDelete", { name: trip.name }))) del.mutate();
                },
              },
            ]}
          />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-head">
          <h2 className="section-title">{t("trip.watches")}</h2>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setAdding(true)}>
            {t("trip.addFlight")}
          </Button>
        </div>
        {watches.length === 0 ? (
          <div>
            <Empty bare icon={<Plane size={36} />} title={t("trip.emptyTitle")}>
              {t("trip.emptyBody")}
            </Empty>
          </div>
        ) : (
          <div className="divide-y divide-rule">
            {watches.map((w) => (
              <WatchRow key={w.id} w={w} />
            ))}
          </div>
        )}
      </div>

      <RulesPanel
        scope={{ trip_id: trip.id }}
        currency={trip.currency}
        title={t("trip.rulesTitle")}
        hint={t("trip.rulesHint")}
      />

      <Modal open={adding} onClose={() => setAdding(false)} title={t("trip.addModal")} wide>
        <p className="mb-3 text-sm text-ink-soft">
          {t("trip.searchFirstBefore")}{" "}
          <Link className="font-semibold text-brand-600 underline" to={`/search?trip=${trip.id}`}>
            {t("trip.searchFirstLink")}
          </Link>{" "}
          {t("trip.searchFirstAfter")}
        </p>
        <WatchEditor
          submitLabel={t("trip.addSubmit")}
          pending={addWatch.isPending}
          error={addWatch.error}
          onCancel={() => setAdding(false)}
          onSubmit={(d) => addWatch.mutate(d)}
        />
      </Modal>
      <Modal open={editing} onClose={() => setEditing(false)} title={t("trip.editModal")}>
        <TripForm initial={trip} tripId={trip.id} submitLabel={t("common.save")} pending={update.isPending} error={update.error} onSubmit={(d) => update.mutate(d)} />
      </Modal>
    </div>
  );
}

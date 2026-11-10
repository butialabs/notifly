import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { Archive, Luggage, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button, Empty, ErrorBox, Modal, Spinner } from "../components/ui";
import { EmojiPicker } from "../components/EmojiPicker";
import { stampEmoji, TripStamp } from "../components/Stamps";
import { t } from "../i18n";
import { api } from "../lib/api";
import { money, shortDate, tinyDate } from "../lib/format";

export function TripForm({
  initial,
  onSubmit,
  pending,
  error,
  submitLabel,
  tripId,
}: {
  tripId?: number;
  initial?: { name: string; description?: string | null; emoji?: string | null };
  onSubmit: (d: { name: string; description: string | null; emoji: string | null }) => void;
  pending?: boolean;
  error?: unknown;
  submitLabel: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState(stampEmoji(initial?.emoji));
  const [description, setDescription] = useState(initial?.description ?? "");
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ name, description: description || null, emoji });
      }}
    >
      <div className="flex items-start gap-4">
        <EmojiPicker value={emoji} onChange={setEmoji} tripId={tripId} />
        <div className="flex-1">
          <label className="label" htmlFor="trip-name">
            {t("trips.name")}
          </label>
          <input id="trip-name" className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder={t("trips.namePlaceholder")} autoFocus />
          <p className="mt-1 text-sm text-ink-mute">{t("trips.emojiHint")}</p>
        </div>
      </div>
      <div>
        <label className="label" htmlFor="trip-notes">
          {t("trips.notes")}
        </label>
        <textarea id="trip-notes" className="input min-h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("trips.notesPlaceholder")} />
      </div>
      <ErrorBox error={error} />
      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={pending} disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function TripsPage() {
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: trips, isLoading, error, refetch } = useQuery({ queryKey: ["trips", archived], queryFn: () => api.trips(archived) });
  const create = useMutation({
    mutationFn: api.createTrip,
    onSuccess: (t) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      nav(`/trips/${t.id}`);
    },
  });

  return (
    <div className="page-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="denom text-[1.75rem] leading-none text-ink sm:text-[2.25rem]">{t("trips.title")}</h1>
        <div className="flex gap-2">
          <Button variant="ghost" aria-pressed={archived} icon={<Archive size={16} />} onClick={() => setArchived(!archived)}>
            {archived ? t("trips.showActive") : t("trips.showArchived")}
          </Button>
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
            {t("trips.new")}
          </Button>
        </div>
      </div>

      {isLoading && <Spinner />}
      <ErrorBox error={error} onRetry={() => refetch()} />
      {trips && trips.length === 0 && (
        <Empty icon={<Luggage size={40} />} title={archived ? t("trips.emptyArchived") : t("trips.empty")}>
          {!archived && (
            <>
              {t("trips.emptyBody")}
              <div className="mt-4">
                <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
                  {t("trips.create")}
                </Button>
              </div>
            </>
          )}
        </Empty>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {trips?.map((trip) => (
          <Link key={trip.id} to={`/trips/${trip.id}`} className="card card-pad group transition-shadow hover:[box-shadow:var(--shadow-pop)]">
            <div className="flex items-start gap-3">
              <TripStamp id={trip.id} name={trip.name} emoji={trip.emoji} size={44} />
              <div className="min-w-0 flex-1">
                <h2 className="section-title truncate group-hover:text-brand-600">{trip.name}</h2>
                <p className="text-sm text-ink-soft">
                  {trip.start_date ? `${shortDate(trip.start_date)} – ${shortDate(trip.end_date)}` : t("trips.noFlights")}
                </p>
              </div>
            </div>
            {(trip.watch_prices?.length ?? 0) > 1 ? (
              <>
                <ul className="mt-4 divide-y divide-rule border-t border-rule">
                  {trip.watch_prices!.map((p) => (
                    <li key={p.id} className={clsx("flex items-baseline gap-3 py-2", !p.active && "opacity-60")}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{p.route}</span>
                        <span className="block truncate text-sm text-ink-mute">
                          {tinyDate(p.date)}
                          {p.return_date && ` – ${tinyDate(p.return_date)}`}
                          {p.label && ` · ${p.label}`}
                          {!p.active && t("trips.pausedSuffix")}
                        </span>
                      </span>
                      <span className="shrink-0 text-base font-bold text-ink tnum">{money(p.price, p.currency)}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-1 text-sm text-ink-soft">
                  {t("trips.flightsN", { n: trip.watch_count })}
                  {trip.active_watch_count < trip.watch_count && t("trips.activeN", { n: trip.active_watch_count })}
                </div>
              </>
            ) : (
              <div className="mt-4 flex items-end justify-between">
                <div className="text-sm text-ink-soft">
                  {t("trips.flights", { n: trip.watch_count })}
                  {trip.watch_count > 0 && trip.active_watch_count < trip.watch_count && t("trips.pausedParen")}
                </div>
                <div className="text-right">
                  <div className="denom text-[2rem] text-ink">{money(trip.best_price, trip.currency)}</div>
                  <div className="mt-1 text-sm text-ink-mute">{t("trips.priceNow")}</div>
                </div>
              </div>
            )}
          </Link>
        ))}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("trips.new")}>
        <TripForm submitLabel={t("trips.create")} pending={create.isPending} error={create.error} onSubmit={(d) => create.mutate(d)} />
      </Modal>
    </div>
  );
}

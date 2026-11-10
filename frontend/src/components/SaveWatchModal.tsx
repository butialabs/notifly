import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { dateLocale, t } from "../i18n";
import { api, type FlightQuery } from "../lib/api";
import { intervalText, querySummary } from "../lib/format";
import { EmojiPicker } from "./EmojiPicker";
import { DEFAULT_TRIP_EMOJI, stampEmoji } from "./Stamps";
import { Button, ErrorBox, Modal } from "./ui";

export const INTERVALS = [30, 60, 180, 360, 720, 1440];

export type SaveMode = "new" | "existing";

/** Suggested name: destination city + departure month/year (e.g. "Lisbon · jan 2027"). */
function useSuggestedName(query: FlightQuery, enabled: boolean) {
  const code = query.segments[0]?.destinations[0];
  const { data } = useQuery({
    queryKey: ["places", code],
    queryFn: () => api.airports(code),
    enabled: enabled && !!code,
    staleTime: Infinity,
  });
  const place = data?.find((p) => p.codes.includes(code)) ?? data?.[0];
  const city = place?.city || code || t("saveWatch.tripFallback");
  const when = query.segments[0]?.date ? format(parseISO(query.segments[0].date), t("dates.monthYear"), { locale: dateLocale() }) : "";
  return when ? `${city} · ${when}` : city;
}

export function SaveWatchModal({
  open,
  onClose,
  query,
  mode: initialMode,
  defaultTripId,
  routeLabel,
}: {
  open: boolean;
  onClose: () => void;
  query: FlightQuery;
  mode: SaveMode;
  defaultTripId?: number;
  routeLabel: string;
}) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: trips = [] } = useQuery({ queryKey: ["trips"], queryFn: () => api.trips(), enabled: open });
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const suggested = useSuggestedName(query, open);
  const [mode, setMode] = useState<SaveMode>(initialMode);
  const [tripId, setTripId] = useState<string>(defaultTripId ? String(defaultTripId) : "");
  const [newName, setNewName] = useState("");
  const [emoji, setEmoji] = useState(DEFAULT_TRIP_EMOJI);
  const [label, setLabel] = useState("");
  const [interval, setInterval] = useState(360);

  useEffect(() => {
    if (open) setMode(initialMode);
  }, [open, initialMode]);
  useEffect(() => {
    if (settings) setInterval(settings.default_check_interval_minutes);
  }, [settings]);
  useEffect(() => {
    if (defaultTripId) setTripId(String(defaultTripId));
    else if (!tripId && trips.length) setTripId(String(trips[0].id));
  }, [trips, defaultTripId, tripId]);

  const save = useMutation({
    mutationFn: async () => {
      let id = Number(tripId);
      if (mode === "new") {
        const t = await api.createTrip({ name: newName.trim() || suggested, emoji });
        id = t.id;
      }
      await api.createWatch(id, { label: label || null, query, check_interval_minutes: interval });
      return id;
    },
    onSuccess: (id) => {
      qc.invalidateQueries({ queryKey: ["trips"] });
      qc.invalidateQueries({ queryKey: ["trip"] });
      onClose();
      nav(`/trips/${id}`);
    },
  });

  const canExisting = trips.length > 0;

  return (
    <Modal open={open} onClose={onClose} title={mode === "new" ? t("saveWatch.titleNew") : t("saveWatch.titleExisting")}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="rounded-lg bg-paper px-3 py-2 text-sm">
          <div className="font-semibold">{routeLabel}</div>
          <div className="text-ink-soft">{querySummary(query)}</div>
        </div>

        {mode === "new" ? (
          <div className="flex items-start gap-4">
            <EmojiPicker value={emoji} onChange={setEmoji} />
            <div className="flex-1">
              <label className="label" htmlFor="new-trip-name">
                {t("saveWatch.tripName")}
              </label>
              <input
                id="new-trip-name"
                className="input"
                placeholder={suggested}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              {canExisting && (
                <button type="button" className="mt-2 text-sm font-semibold text-brand-600 underline" onClick={() => setMode("existing")}>
                  {t("saveWatch.orExisting")}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div>
            <label className="label" htmlFor="existing-trip">
              {t("saveWatch.trip")}
            </label>
            <select id="existing-trip" className="input" value={tripId} onChange={(e) => setTripId(e.target.value)} required>
              {trips.map((t) => (
                <option key={t.id} value={t.id}>
                  {stampEmoji(t.emoji)} {t.name}
                </option>
              ))}
            </select>
            <button type="button" className="mt-2 text-sm font-semibold text-brand-600 underline" onClick={() => setMode("new")}>
              {t("saveWatch.orNew")}
            </button>
          </div>
        )}

        <div>
          <label className="label" htmlFor="watch-label">
            {t("saveWatch.label")}
          </label>
          <input id="watch-label" className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("saveWatch.labelPlaceholder")} />
        </div>
        <div>
          <label className="label" htmlFor="watch-interval">
            {t("common.checkEvery")}
          </label>
          <select id="watch-interval" className="input" value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            {INTERVALS.filter((i) => !settings || i >= settings.min_check_interval_minutes).map((i) => (
              <option key={i} value={i}>
                {intervalText(i)}
              </option>
            ))}
          </select>
        </div>
        <ErrorBox error={save.error} />
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" loading={save.isPending} disabled={save.isPending || (mode === "existing" && !tripId)}>
            {mode === "new" ? t("saveWatch.submitNew") : t("saveWatch.submitExisting")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

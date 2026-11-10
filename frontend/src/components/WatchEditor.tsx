import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { FlightQuery } from "../lib/api";
import { t } from "../i18n";
import { api } from "../lib/api";
import { intervalText } from "../lib/format";
import { INTERVALS } from "./SaveWatchModal";
import { defaultQuery, SearchForm } from "./SearchForm";
import { Button, ErrorBox } from "./ui";

export interface WatchDraft {
  label: string | null;
  query: FlightQuery;
  check_interval_minutes: number;
}

export function WatchEditor({
  initial,
  onSubmit,
  pending,
  error,
  submitLabel,
  onCancel,
}: {
  initial?: Partial<WatchDraft>;
  onSubmit: (d: WatchDraft) => void;
  pending?: boolean;
  error?: unknown;
  submitLabel: string;
  onCancel: () => void;
}) {
  const { data: settings } = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const [query, setQuery] = useState<FlightQuery>(initial?.query ?? defaultQuery());
  const [label, setLabel] = useState(initial?.label ?? "");
  const [interval, setInterval] = useState(initial?.check_interval_minutes ?? settings?.default_check_interval_minutes ?? 360);
  const ready = query.segments.every((s) => s.origins.length && s.destinations.length && s.date);
  const options = Array.from(new Set([...INTERVALS, interval])).sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <SearchForm value={query} onChange={setQuery} compact />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label">{t("watchEditor.label")}</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("watchEditor.labelPlaceholder")} />
        </div>
        <div>
          <label className="label">{t("common.checkEvery")}</label>
          <select className="input" value={interval} onChange={(e) => setInterval(Number(e.target.value))}>
            {options
              .filter((i) => !settings || i >= settings.min_check_interval_minutes)
              .map((i) => (
                <option key={i} value={i}>
                  {intervalText(i)}
                </option>
              ))}
          </select>
        </div>
      </div>
      <ErrorBox error={error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onCancel}>{t("common.cancel")}</Button>
        <Button
          variant="primary"
          disabled={!ready || pending}
          onClick={() => onSubmit({ label: label || null, query, check_interval_minutes: interval })}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

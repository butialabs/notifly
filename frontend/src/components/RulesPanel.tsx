import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { api, type Rule, type RuleKind } from "../lib/api";
import { t } from "../i18n";
import { intervalText, money, ruleLabel, ruleLabels } from "../lib/format";
import { Button, ErrorBox, Modal, Toggle } from "./ui";

function describe(r: Rule, currency?: string | null) {
  const parts: string[] = [];
  if (r.threshold) parts.push(money(r.threshold, currency));
  if (r.min_change_abs) parts.push(t("rules.minChangeAbs", { value: money(r.min_change_abs, currency) }));
  if (r.min_change_pct) parts.push(t("rules.minChangePct", { value: r.min_change_pct }));
  if (r.cooldown_minutes) parts.push(t("rules.cooldown", { interval: intervalText(r.cooldown_minutes) }));
  if (r.repeat_while_matching) parts.push(t("rules.repeat"));
  return parts.join(" · ");
}

function RuleForm({
  scope,
  currency,
  onDone,
}: {
  scope: { trip_id?: number; watch_id?: number };
  currency?: string | null;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const { data: channels = [] } = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const [kind, setKind] = useState<RuleKind>("below_threshold");
  const [threshold, setThreshold] = useState("");
  const [minAbs, setMinAbs] = useState("");
  const [minPct, setMinPct] = useState("");
  const [cooldown, setCooldown] = useState("0");
  const [repeat, setRepeat] = useState(false);
  const [chs, setChs] = useState<number[]>([]);
  const isThreshold = kind === "below_threshold" || kind === "above_threshold";
  const save = useMutation({
    mutationFn: () =>
      api.createRule({
        ...scope,
        kind,
        threshold: isThreshold ? Number(threshold) : null,
        min_change_abs: !isThreshold && minAbs ? Number(minAbs) : null,
        min_change_pct: !isThreshold && minPct ? Number(minPct) : null,
        cooldown_minutes: Number(cooldown),
        repeat_while_matching: repeat,
        channel_ids: chs,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["rules"] });
      onDone();
    },
  });

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div>
        <label className="label">{t("rules.when")}</label>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as RuleKind)}>
          {(Object.entries(ruleLabels()) as [RuleKind, string][]).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
      </div>
      {isThreshold ? (
        <div>
          <label className="label">{t("rules.threshold", { currency: currency ?? t("rules.currencyFallback") })}</label>
          <input className="input" type="number" min={1} required value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={t("rules.thresholdPlaceholder")} />
          <div className="mt-2">
            <Toggle checked={repeat} onChange={setRepeat} label={<span className="text-sm">{t("rules.repeatToggle")}</span>} />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("rules.minAbs", { currency: currency ?? t("rules.valueFallback") })}</label>
            <input className="input" type="number" min={0} value={minAbs} onChange={(e) => setMinAbs(e.target.value)} placeholder={t("rules.optional")} />
          </div>
          <div>
            <label className="label">{t("rules.minPct")}</label>
            <input className="input" type="number" min={0} step="0.1" value={minPct} onChange={(e) => setMinPct(e.target.value)} placeholder={t("rules.optional")} />
          </div>
        </div>
      )}
      <div>
        <label className="label">{t("rules.cooldownLabel")}</label>
        <select className="input" value={cooldown} onChange={(e) => setCooldown(e.target.value)}>
          <option value="0">{t("rules.cooldownNone")}</option>
          <option value="60">{t("rules.cooldown1h")}</option>
          <option value="360">{t("rules.cooldown6h")}</option>
          <option value="720">{t("rules.cooldown12h")}</option>
          <option value="1440">{t("rules.cooldown1d")}</option>
          <option value="10080">{t("rules.cooldown1w")}</option>
        </select>
      </div>
      <div>
        <label className="label">{t("rules.channels")}</label>
        {channels.length === 0 ? (
          <p className="text-sm text-ink-mute">
            {t("rules.noChannels")}{" "}
            <Link className="text-brand-600 underline" to="/notifications">
              {t("rules.noChannelsLink")}
            </Link>
            .
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {channels.map((c) => (
              <label key={c.id} className="chip cursor-pointer">
                <input
                  type="checkbox"
                  className="accent-brand-600"
                  checked={chs.includes(c.id)}
                  onChange={(e) => setChs(e.target.checked ? [...chs, c.id] : chs.filter((x) => x !== c.id))}
                />
                {c.name}
              </label>
            ))}
          </div>
        )}
        <p className="mt-1 text-sm text-ink-mute">{t("rules.allActiveHint")}</p>
      </div>
      <ErrorBox error={save.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={save.isPending}>
          {t("rules.create")}
        </Button>
      </div>
    </form>
  );
}

export function RulesPanel({
  scope,
  currency,
  title = t("rules.title"),
  hint,
}: {
  scope: { trip_id?: number; watch_id?: number };
  currency?: string | null;
  title?: string;
  hint?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const { data: rules = [] } = useQuery({ queryKey: ["rules", scope], queryFn: () => api.rules(scope) });
  const { data: channels = [] } = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const update = useMutation({
    mutationFn: ({ id, ...d }: Partial<Rule> & { id: number }) => api.updateRule(id, d),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["rules"] }),
  });
  const del = useMutation({
    mutationFn: (id: number) => api.deleteRule(id),
    onSuccess: () => {
      setConfirming(null);
      qc.invalidateQueries({ queryKey: ["rules"] });
      qc.invalidateQueries({ queryKey: ["watch"] });
    },
  });
  const chName = (id: number) => channels.find((c) => c.id === id)?.name ?? `#${id}`;

  return (
    <div className="card card-pad">
      <div className="section-head">
        <div>
          <h2 className="section-title flex items-center gap-2">
            <Bell size={18} /> {title}
          </h2>
          {hint && <p className="text-sm text-ink-mute">{hint}</p>}
        </div>
        <Button variant="ghost" className="-mr-4" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
          {t("rules.new")}
        </Button>
      </div>
      {rules.length === 0 ? (
        <p className="text-sm text-ink-mute">{t("rules.empty")}</p>
      ) : (
        <ul className="divide-y divide-rule">
          {rules.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              {r.enabled ? <Bell size={16} className="text-brand-600" /> : <BellOff size={16} className="text-ink-mute" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{ruleLabel(r.kind)}</div>
                <div className="truncate text-sm text-ink-mute">
                  {[describe(r, currency), r.channel_ids.length ? r.channel_ids.map(chName).join(", ") : t("rules.allChannels")].filter(Boolean).join(" · ")}
                </div>
              </div>
              <Toggle
                checked={r.enabled}
                onChange={(v) => update.mutate({ id: r.id, enabled: v })}
                label={<span className="sr-only">{t(r.enabled ? "rules.disable" : "rules.enable", { rule: ruleLabel(r.kind) })}</span>}
              />
              {confirming === r.id ? (
                <span className="flex items-center gap-1">
                  <Button variant="danger" size="sm" onClick={() => del.mutate(r.id)}>
                    {t("common.delete")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
                    {t("common.keep")}
                  </Button>
                </span>
              ) : (
                <Button variant="danger" iconOnly aria-label={t("rules.deleteAria", { rule: ruleLabel(r.kind) })} icon={<Trash2 size={16} />} onClick={() => setConfirming(r.id)} />
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title={t("rules.modal")}>
        <RuleForm scope={scope} currency={currency} onDone={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

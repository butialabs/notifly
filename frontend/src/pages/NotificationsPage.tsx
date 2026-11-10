import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import clsx from "clsx";
import { CheckCircle2, Pencil, Plus, Radio, Send, Trash2, XCircle } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button, Empty, ErrorBox, Modal, Spinner, Toggle } from "../components/ui";
import { t } from "../i18n";
import { api, type Channel } from "../lib/api";
import { dateTime } from "../lib/format";

const APPRISE_DOCS = "https://github.com/caronc/apprise/wiki";

/** A channel is one Apprise URL, as the Apprise docs describe. Without `channel`, creates a new one. */
function ChannelForm({ channel, onDone }: { channel?: Channel; onDone: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(channel?.name ?? "");
  // The saved URL never comes back from the server (tokens, passwords); when editing, empty keeps it.
  const [url, setUrl] = useState("");
  const create = useMutation({
    mutationFn: () => {
      const u = url.trim();
      if (channel) {
        return api.updateChannel(channel.id, { name: name.trim() || channel.name, ...(u ? { url: u } : {}) });
      }
      return api.createChannel({ name: name.trim() || u.split("://")[0], url: u, enabled: true });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["channels"] });
      onDone();
    },
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        create.mutate();
      }}
    >
      <p className="text-sm text-ink-soft">
        {t("notifications.introBefore")}{" "}
        <a className="font-semibold text-brand-600 underline" href={APPRISE_DOCS} target="_blank" rel="noreferrer">
          {t("notifications.introLink")}
        </a>
        {t("notifications.introAfter")}
      </p>
      <div>
        <label className="label" htmlFor="ch-url">
          {t("notifications.url")}
        </label>
        <input
          id="ch-url"
          className="input font-mono"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={
            channel ? channel.url_masked : t("notifications.urlPlaceholder")
          }
          autoComplete="off"
          spellCheck={false}
          required={!channel}
        />
        {channel && <p className="mt-1 text-sm text-ink-mute">{t("notifications.keepUrl")}</p>}
      </div>
      <div>
        <label className="label" htmlFor="ch-name">
          {t("notifications.name")}
        </label>
        <input id="ch-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("notifications.namePlaceholder")} />
      </div>
      <ErrorBox error={create.error} />
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" loading={create.isPending} disabled={create.isPending || (!channel && !url.trim())}>
          {channel ? t("common.save") : t("notifications.add")}
        </Button>
      </div>
    </form>
  );
}

function ChannelRow({ c }: { c: Channel }) {
  const qc = useQueryClient();
  const [result, setResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const test = useMutation({
    mutationFn: () => api.testChannel(c.id),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const update = useMutation({
    mutationFn: (enabled: boolean) => api.updateChannel(c.id, { enabled }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
  const del = useMutation({
    mutationFn: () => api.deleteChannel(c.id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["channels"] }),
  });
  return (
    <li className="card-row flex flex-wrap items-center gap-3">
      <Radio size={18} className={c.enabled ? "text-brand-600" : "text-ink-mute"} />
      <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
        <div className="font-semibold">{c.name}</div>
        <div className="truncate font-mono text-sm text-ink-mute">{c.url_masked.slice(0, 60)}</div>
        {result && (
          <div className={clsx("mt-1 text-sm", result.ok ? "text-good" : "text-bad")}>
            {result.ok ? t("notifications.testOk") : t("notifications.testFailed", { error: result.error ?? "" })}
          </div>
        )}
      </div>
      <Button variant="ghost" className="ml-auto sm:ml-0" loading={test.isPending} icon={<Send size={16} />} onClick={() => test.mutate()} disabled={test.isPending}>
        {t("notifications.test")}
      </Button>
      <Button
        variant="ghost"
        iconOnly
        aria-label={t("notifications.editAria", { name: c.name })}
        icon={<Pencil size={16} />}
        onClick={() => {
          setResult(null);
          setEditing(true);
        }}
      />
      <Toggle checked={c.enabled} onChange={(v) => update.mutate(v)} ariaLabel={t(c.enabled ? "notifications.disableAria" : "notifications.enableAria", { name: c.name })} />
      <Button
        variant="danger"
        iconOnly
        aria-label={t("notifications.deleteAria", { name: c.name })}
        icon={<Trash2 size={16} />}
        onClick={() => window.confirm(t("notifications.confirmDelete", { name: c.name })) && del.mutate()}
      />
      <Modal open={editing} onClose={() => setEditing(false)} title={t("notifications.editTitle")}>
        {/* key: remount the form with current data on every open */}
        {editing && <ChannelForm key={c.url_masked + c.name} channel={c} onDone={() => setEditing(false)} />}
      </Modal>
    </li>
  );
}

export function NotificationsPage() {
  const [open, setOpen] = useState(false);
  const { data: channels, isLoading, error, refetch } = useQuery({ queryKey: ["channels"], queryFn: api.channels });
  const { data: log = [] } = useQuery({ queryKey: ["notifications"], queryFn: () => api.notifications(100), refetchInterval: 30_000 });

  return (
    <div className="page-stack">
      <div className="flex items-center justify-between">
        <h1 className="denom text-[1.75rem] leading-none text-ink sm:text-[2.25rem]">{t("notifications.title")}</h1>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>
          {t("notifications.newChannel")}
        </Button>
      </div>

      <div className="card overflow-hidden">
        <div className="card-head block">
          <h2 className="section-title">{t("notifications.channels")}</h2>
          <p className="text-sm text-ink-mute">{t("notifications.channelsHint")}</p>
        </div>
        {isLoading && <div className="card-row"><Spinner /></div>}
        {error && (
          <div className="card-row">
            <ErrorBox error={error} onRetry={() => refetch()} />
          </div>
        )}
        {channels && channels.length === 0 && (
          <div>
            <Empty bare icon={<Radio size={36} />} title={t("notifications.emptyTitle")}>
              {t("notifications.emptyBody")}
            </Empty>
          </div>
        )}
        <ul className="divide-y divide-rule">
          {channels?.map((c) => <ChannelRow key={c.id} c={c} />)}
        </ul>
      </div>

      <div className="card overflow-hidden">
        <div className="card-head">
          <h2 className="section-title">{t("notifications.history")}</h2>
        </div>
        {log.length === 0 ? (
          <p className="card-row text-sm text-ink-mute">{t("notifications.historyEmpty")}</p>
        ) : (
          <ul className="divide-y divide-rule">
            {log.map((n) => (
              <li key={n.id} className="card-row flex gap-3">
                {n.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-good" /> : <XCircle size={18} className="mt-0.5 shrink-0 text-bad" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-medium">{n.title}</span>
                    {n.is_test && <span className="rounded bg-paper px-2 py-1 text-sm leading-none">{t("notifications.testTag")}</span>}
                  </div>
                  <div className="text-sm text-ink-mute">
                    {dateTime(n.created_at)}
                    {n.channel_id && ` · ${channels?.find((c) => c.id === n.channel_id)?.name ?? t("notifications.removedChannel")}`}
                    {n.watch_id && (
                      <>
                        {" · "}
                        <Link className="text-brand-600 hover:underline" to={`/watches/${n.watch_id}`}>
                          {t("notifications.seeFlight")}
                        </Link>
                      </>
                    )}
                  </div>
                  {n.error && <div className="mt-1 text-sm text-bad">{n.error}</div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={t("notifications.newTitle")}>
        <ChannelForm onDone={() => setOpen(false)} />
      </Modal>
    </div>
  );
}

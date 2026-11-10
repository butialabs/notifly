import { useCallback, useEffect, useRef, useState } from "react";
import { t, useI18n } from "../i18n";
import { TripStamp } from "./Stamps";
import { Spinner, useClickOutside } from "./ui";

interface PtEmoji {
  hexcode: string;
  label: string;
  tags?: string[];
}

const norm = (hex: string) =>
  hex
    .toLowerCase()
    .split("-")
    .filter((p) => p !== "fe0f")
    .join("-");

/** emoji-mart only translates its UI; to search in Portuguese ("praia", "avião") we merge in emojibase keywords. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function addPortugueseKeywords(data: any, pt: PtEmoji[]) {
  if (data.__ptKeywords) return;
  const byHex = new Map(pt.map((e) => [norm(e.hexcode), e]));
  for (const emoji of Object.values(data.emojis) as { keywords: string[]; skins: { unified: string }[] }[]) {
    const match = byHex.get(norm(emoji.skins[0].unified));
    if (!match) continue;
    const words = [...(match.tags ?? []), ...match.label.split(/[\s:,]+/)].map((w) => w.toLowerCase())
      .filter((w) => w.length > 1)
      .flatMap((w) => [w, w.normalize("NFD").replace(/[̀-ͯ]/g, "")]);
    emoji.keywords = Array.from(new Set([...emoji.keywords, ...words]));
  }
  data.__ptKeywords = true;
}

/** emoji-mart categories without flags (Windows renders them as letters). */
const CATEGORIES = ["frequent", "people", "nature", "foods", "activity", "places", "objects", "symbols"];

/** Full emoji picker (emoji-mart, with search), lazy loaded. The pick becomes the trip stamp. */
export function EmojiPicker({
  value,
  onChange,
  tripId,
}: {
  value: string;
  onChange: (emoji: string) => void;
  tripId?: number;
}) {
  const { lang } = useI18n();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const wrap = useClickOutside<HTMLDivElement>(close);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let picker: HTMLElement | null = null;
    setLoading(true);
    // emoji-mart ships English; Portuguese loads its translations.
    const isPt = lang === "pt-BR";
    Promise.all([
      import("emoji-mart"),
      import("@emoji-mart/data"),
      isPt ? import("@emoji-mart/data/i18n/pt.json") : null,
      isPt ? import("emojibase-data/pt/compact.json") : null,
    ]).then(
      ([mart, dataMod, pt, ptKeywords]) => {
        if (cancelled || !host.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const Picker = (mart as any).Picker;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = ((dataMod as any).default ?? dataMod) as any;
        if (ptKeywords) addPortugueseKeywords(data, ((ptKeywords as { default?: unknown }).default ?? ptKeywords) as PtEmoji[]);
        picker = new Picker({
          data,
          ...(pt ? { i18n: (pt as { default?: unknown }).default ?? pt, locale: "pt" } : { locale: "en" }),
          theme: "light",
          set: "native",
          previewPosition: "none",
          skinTonePosition: "search",
          categories: CATEGORIES,
          autoFocus: true,
          onEmojiSelect: (e: { native: string }) => {
            onChange(e.native);
            setOpen(false);
            trigger.current?.focus();
          },
        }) as HTMLElement;
        host.current.replaceChildren(picker);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
      picker?.remove();
    };
  }, [open, onChange, lang]);

  return (
    <div
      ref={wrap}
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={t("emoji.trigger", { emoji: value })}
        onClick={() => setOpen((o) => !o)}
        className="group flex flex-col items-center gap-1 rounded-lg p-1 hover:bg-brand-50"
      >
        <TripStamp id={tripId} emoji={value} size={52} />
        <span className="text-sm font-semibold text-brand-600 group-hover:underline">{t("emoji.change")}</span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={t("emoji.dialog")}
          className="absolute left-0 z-50 mt-2 min-h-24 min-w-24 rounded-xl bg-white"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          {loading && (
            <div className="flex items-center gap-2 p-4 text-sm text-ink-soft">
              <Spinner /> {t("emoji.loading")}
            </div>
          )}
          <div ref={host} />
        </div>
      )}
    </div>
  );
}

import clsx from "clsx";
import { MoreHorizontal } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { t } from "../i18n";

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

const MENU_W = 240;
const GAP = 8;
const EDGE = 16;

/**
 * Secondary actions menu ("⋯"): Esc closes, arrow keys move. Renders in a fixed portal
 * so cards with overflow-hidden don't clip it.
 */
export function OverflowMenu({ items, label = t("ui.moreActions") }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);

  const place = useCallback(() => {
    const b = btn.current?.getBoundingClientRect();
    if (!b) return;
    const h = menu.current?.offsetHeight ?? 0;
    const left = Math.min(Math.max(b.right - MENU_W, EDGE), window.innerWidth - MENU_W - EDGE);
    const below = b.bottom + GAP;
    const top = below + h > window.innerHeight - EDGE && b.top - GAP - h > EDGE ? b.top - GAP - h : below;
    setPos({ top, left });
  }, []);

  // Position before paint; the menu is already mounted, so its height is real.
  useLayoutEffect(() => {
    if (open) place();
    else setPos(null);
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, close, place]);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
      btn.current?.focus();
      return;
    }
    if (e.key === "Tab") {
      close();
      return;
    }
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const els = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []);
    const i = els.indexOf(document.activeElement as HTMLButtonElement);
    els[(i + (e.key === "ArrowDown" ? 1 : -1) + els.length) % els.length]?.focus();
  };

  return (
    <>
      <button
        ref={btn}
        type="button"
        className="btn-outline btn-icon"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => e.key === "Escape" && open && onKey(e)}
      >
        <MoreHorizontal size={18} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-label={label}
            onKeyDown={onKey}
            className="fixed z-50 rounded-xl border border-rule bg-white p-1.5"
            style={{
              width: MENU_W,
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              visibility: pos ? "visible" : "hidden",
              boxShadow: "var(--shadow-pop)",
            }}
          >
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  close();
                  btn.current?.focus();
                  it.onSelect();
                }}
                className={clsx(
                  "flex min-h-10 w-full gap-3 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-brand-50 focus:bg-brand-50 focus:outline-none disabled:opacity-40",
                  it.hint ? "items-start" : "items-center",
                  it.danger ? "text-danger" : "text-ink",
                )}
              >
                <span className={clsx("grid shrink-0 place-items-center", it.hint && "h-5")}>{it.icon}</span>
                <span>
                  <span className="block font-semibold">{it.label}</span>
                  {it.hint && <span className="block text-sm text-ink-mute">{it.hint}</span>}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}

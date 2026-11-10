import clsx from "clsx";
import { Loader2, Minus, Plus, X } from "lucide-react";
import {
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { t } from "../i18n";

export function useClickOutside<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onOutside]);
  return ref;
}

export function useDebounced<T>(value: T, ms = 200) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/* ------------------------------------------------------------------ buttons */

export type ButtonVariant = "primary" | "outline" | "ghost" | "plain" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  outline: "btn-outline",
  ghost: "btn-ghost",
  plain: "btn-plain",
  danger: "btn-danger",
};
const SIZE: Record<ButtonSize, string> = { sm: "btn-sm", md: "", lg: "btn-lg" };

export function buttonClass(variant: ButtonVariant = "outline", size: ButtonSize = "md", iconOnly = false, className?: string) {
  return clsx(VARIANT[variant], SIZE[size], iconOnly && (size === "sm" ? "btn-icon-sm" : "btn-icon"), className);
}

/** Control label centered on cap height, not on the line box. */
export function BtnLabel({ children }: { children: ReactNode }) {
  return <span className="ctl-label">{children}</span>;
}

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  iconRight?: ReactNode;
  loading?: boolean;
  /** Icon-only button: requires `aria-label`. */
  iconOnly?: boolean;
  children?: ReactNode;
};

type ButtonAsButton = CommonProps & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { href?: undefined };
type ButtonAsLink = CommonProps & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> & { href: string };

export function Button(props: ButtonAsButton | ButtonAsLink) {
  const { variant = "outline", size = "md", icon, iconRight, loading, iconOnly, children, className, ...rest } = props;
  const cls = buttonClass(variant, size, iconOnly, className);
  const content = (
    <>
      {loading ? <Spinner /> : icon}
      {children != null && children !== false && !iconOnly && <BtnLabel>{children}</BtnLabel>}
      {iconRight}
    </>
  );
  if ("href" in rest && rest.href) {
    return (
      <a className={cls} {...(rest as AnchorHTMLAttributes<HTMLAnchorElement>)}>
        {content}
      </a>
    );
  }
  const b = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type={b.type ?? "button"} className={cls} {...b}>
      {content}
    </button>
  );
}

/* ------------------------------------------------------------------ popover / modal */

/** Button that opens a floating panel. */
export function Popover({
  trigger,
  children,
  className,
  align = "left",
}: {
  trigger: (open: boolean) => ReactNode;
  children: (close: () => void) => ReactNode;
  className?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  return (
    <div
      className="relative"
      ref={ref}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
        }
      }}
    >
      <div onClick={() => setOpen((o) => !o)}>{trigger(open)}</div>
      {open && (
        <div
          className={clsx(
            "absolute z-30 mt-2 min-w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-rule bg-white p-4",
            align === "right" ? "right-0" : "left-0",
            className,
          )}
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  // onClose changes on every parent render; a ref keeps the effect dependent on `open` only.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Capture the focused element on the render that opens the modal, before any inner autoFocus.
  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) returnTo.current = document.activeElement as HTMLElement | null;
  wasOpen.current = open;

  useEffect(() => {
    if (!open) return;
    const previous = returnTo.current;
    // initial focus: first field, else the dialog itself
    requestAnimationFrame(() => {
      const first = panel.current?.querySelector<HTMLElement>("input, select, textarea") ?? panel.current;
      first?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 pt-[8vh]"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={clsx("card card-pad w-full outline-none", wide ? "max-w-5xl" : "max-w-lg")}
      >
        <div className="section-head -mt-2 -mr-2">
          <h2 id={titleId} className="section-title">
            {title}
          </h2>
          <Button variant="plain" iconOnly aria-label={t("common.close")} icon={<X size={20} />} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ states */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin", className)} size={18} />;
}

export function Empty({ icon, title, children, bare }: { icon: ReactNode; title: string; children?: ReactNode; bare?: boolean }) {
  return (
    <div className={clsx("flex flex-col items-center gap-3 px-6 py-8 text-center", !bare && "card")}>
      <div className="text-brand-600">{icon}</div>
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-md text-sm text-ink-mute">{children}</div>}
    </div>
  );
}

export function ErrorBox({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-red-50 px-4 py-3 text-sm text-danger">
      <span className="min-w-0 flex-1 break-words">{error instanceof Error ? error.message : String(error)}</span>
      {onRetry && (
        <Button size="sm" onClick={onRetry}>
          {t("common.retry")}
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ controls */

/** Switch: 20×36 track inside a 40px touch area. */
export function Toggle({
  checked,
  onChange,
  label,
  ariaLabel,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={ariaLabel}
        onClick={() => onChange(!checked)}
        className="-m-2.5 grid min-h-10 min-w-10 place-items-center rounded-full p-2.5 pointer-coarse:min-h-11 pointer-coarse:min-w-11"
      >
        <span className={clsx("relative block h-5 w-9 rounded-full transition-colors", checked ? "bg-brand-600" : "bg-rule")}>
          <span
            className={clsx(
              "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-all",
              checked ? "left-[18px]" : "left-0.5",
            )}
          />
        </span>
      </button>
      {label}
    </label>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 9,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <Button
        size="sm"
        iconOnly
        aria-label={label ? t("ui.decreaseLabel", { label }) : t("ui.decrease")}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
        icon={<Minus size={16} />}
      />
      <span className="w-4 text-center tabular-nums" aria-live="polite">
        {value}
      </span>
      <Button
        size="sm"
        iconOnly
        aria-label={label ? t("ui.increaseLabel", { label }) : t("ui.increase")}
        disabled={value >= max}
        onClick={() => onChange(value + 1)}
        icon={<Plus size={16} />}
      />
    </div>
  );
}

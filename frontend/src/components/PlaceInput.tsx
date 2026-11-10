import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import { Building2, MapPin, Plane, X } from "lucide-react";
import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import { t } from "../i18n";
import { api, type Place } from "../lib/api";
import { useClickOutside, useDebounced } from "./ui";

function placeLabel(p: Place) {
  return p.type === "city" ? t("place.cityAll", { city: p.city }) : `${p.codes.join("/")} · ${p.city || p.name}`;
}

/** Origin/destination autocomplete. Takes ONE place: an airport or a city (all of its airports). */
export function PlaceInput({
  value,
  onChange,
  placeholder,
  icon = "origin",
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  placeholder: string;
  icon?: "origin" | "destination";
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [chosen, setChosen] = useState<Place | null>(null);
  const [hi, setHi] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const close = useCallback(() => {
    setOpen(false);
    setEditing(false);
    setText("");
  }, []);
  const ref = useClickOutside<HTMLDivElement>(close);
  const q = useDebounced(text.trim(), 150);
  const { data = [] } = useQuery({
    queryKey: ["places", q],
    queryFn: () => api.airports(q),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });

  // On reload/edit we only have the saved codes, so fetch the place name.
  const sameCodes = (p: Place | null | undefined) => !!p && [...p.codes].sort().join() === [...value].sort().join();
  const { data: resolved } = useQuery({
    queryKey: ["place", [...value].sort().join()],
    queryFn: () => api.resolvePlace(value),
    enabled: value.length > 0 && !sameCodes(chosen),
    staleTime: Infinity,
  });
  const place = sameCodes(chosen) ? chosen : sameCodes(resolved) ? resolved : null;
  const current = place ? placeLabel(place) : value.join("/");
  const showChip = value.length > 0 && !editing;
  const listOpen = open && q.length >= 2 && data.length > 0;

  const pick = (p: Place) => {
    setChosen(p);
    onChange(p.codes);
    setText("");
    setOpen(false);
    setEditing(false);
    setHi(0);
  };

  const startEditing = () => {
    setEditing(true);
    setOpen(true);
  };
  // Focus synchronously after swapping the chip for the input so no keystroke is lost.
  useLayoutEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const Icon = icon === "origin" ? MapPin : Plane;

  return (
    <div ref={ref} className="relative min-w-0 flex-1">
      <div
        className="flex min-h-14 items-center gap-2 rounded-lg border border-rule bg-white px-3 py-2 focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100"
        onClick={() => !showChip && inputRef.current?.focus()}
      >
        <Icon size={18} className="shrink-0 text-ink-mute" aria-hidden />
        {showChip ? (
          <>
            <button
              type="button"
              className="-my-2 min-h-14 min-w-0 flex-1 truncate text-left text-base font-semibold text-ink"
              onClick={startEditing}
              aria-label={t("place.change", { field: placeholder, current })}
            >
              {current}
            </button>
            <button
              type="button"
              className="btn-plain btn-sm btn-icon-sm -mr-1.5 text-ink-mute hover:text-ink"
              aria-label={t("place.clear", { field: placeholder.toLowerCase() })}
              onClick={() => {
                setChosen(null);
                onChange([]);
                startEditing();
              }}
            >
              <X size={16} />
            </button>
          </>
        ) : (
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded={listOpen}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={listOpen ? `${listId}-${hi}` : undefined}
            aria-label={placeholder}
            className="min-w-0 flex-1 bg-transparent py-1 text-base outline-none"
            placeholder={value.length ? current : placeholder}
            value={text}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setText(e.target.value);
              setOpen(true);
              setHi(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHi((h) => Math.min(h + 1, data.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHi((h) => Math.max(h - 1, 0));
              } else if (e.key === "Enter" && listOpen && data[hi]) {
                e.preventDefault();
                pick(data[hi]);
              } else if (e.key === "Escape") {
                e.stopPropagation();
                close();
              }
            }}
          />
        )}
      </div>
      {listOpen && (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("place.suggestions", { field: placeholder.toLowerCase() })}
          className="absolute z-40 mt-1 max-h-96 w-full min-w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-xl border border-rule bg-white py-2"
          style={{ boxShadow: "var(--shadow-pop)" }}
        >
          {data.map((p, i) => (
            <li
              key={p.type + p.codes.join()}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === hi}
              onMouseEnter={() => setHi(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
              className={clsx("flex cursor-pointer items-center gap-3 px-4 py-2.5", i === hi && "bg-brand-50")}
            >
              {p.type === "city" ? (
                <Building2 size={20} className="shrink-0 text-ink-mute" aria-hidden />
              ) : (
                <Plane size={20} className="shrink-0 text-ink-mute" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">
                  {p.type === "city" ? `${p.city}, ${p.country}` : p.name}
                </span>
                <span className="block truncate text-sm text-ink-mute">
                  {p.type === "city" ? t("place.allAirports", { codes: p.codes.join(", ") }) : `${p.city}, ${p.country}`}
                </span>
              </span>
              {p.type === "airport" && <span className="text-sm font-semibold text-ink-soft">{p.code}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

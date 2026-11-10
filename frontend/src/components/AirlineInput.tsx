import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useCallback, useState } from "react";
import { t } from "../i18n";
import { api } from "../lib/api";
import { useClickOutside, useDebounced } from "./ui";

export function AirlineInput({
  value,
  onChange,
  placeholder = t("airline.placeholder"),
}: {
  value: string[];
  onChange: (codes: string[]) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  const ref = useClickOutside<HTMLDivElement>(close);
  const q = useDebounced(text.trim(), 150);
  const { data = [] } = useQuery({
    queryKey: ["airlines", q],
    queryFn: () => api.airlines(q),
    enabled: q.length >= 2,
    staleTime: 60_000,
  });

  return (
    <div ref={ref} className="relative">
      <div className="input flex flex-wrap items-center gap-1.5 py-1.5">
        {value.map((c) => (
          <span key={c} className="inline-flex items-center gap-1 rounded bg-paper px-2 py-0.5 text-sm font-semibold">
            {c}
            <button type="button" aria-label={t("airline.remove", { code: c })} className="grid h-6 w-6 place-items-center rounded hover:bg-brand-50" onClick={() => onChange(value.filter((x) => x !== c))}>
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          className="min-w-24 flex-1 bg-transparent outline-none"
          value={text}
          placeholder={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>
      {open && data.length > 0 && (
        <ul className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-rule bg-white py-1"
          style={{ boxShadow: "var(--shadow-pop)" }}>
          {data.map((a) => (
            <li key={a.code}>
              <button
                type="button"
                className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-brand-50"
                onClick={() => {
                  if (!value.includes(a.code)) onChange([...value, a.code]);
                  setText("");
                  setOpen(false);
                }}
              >
                <span>{a.name}</span>
                <span className="font-semibold text-ink-mute">{a.code}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

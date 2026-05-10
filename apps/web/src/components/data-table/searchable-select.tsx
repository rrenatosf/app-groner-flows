"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Dropdown padrão Groner pra qualquer seleção: botão que abre lista
 *  com input de busca, filtro live, click pra escolher. Genérico via
 *  TypeScript — encaixa em cliente, loja, vendedor, agente, etc.
 *
 *  Padrão visual: igual ColumnPicker / LojaPicker — combina com toolbar. */
export function SearchableSelect<
  T,
  K extends string | number,
>({
  items,
  value,
  onChange,
  getKey,
  getLabel,
  getSecondary,
  matches,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  emptyLabel = "Nada encontrado.",
  disabled,
  required,
  width = 280,
  align = "left",
}: {
  items: T[];
  value: K | null;
  onChange: (key: K | null) => void;
  getKey: (item: T) => K;
  getLabel: (item: T) => string;
  getSecondary?: (item: T) => string | null;
  /** Match custom — se omitido, usa label includes(query). */
  matches?: (item: T, query: string) => boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  width?: number;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery("");
    }
  }, [open]);

  const selected = useMemo(
    () => items.find((it) => getKey(it) === value) ?? null,
    [items, value, getKey],
  );

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      getLabel(a).localeCompare(getLabel(b), "pt-BR", {
        sensitivity: "base",
      }),
    );
    if (!q) return sorted;
    if (matches) return sorted.filter((it) => matches(it, q));
    return sorted.filter((it) => getLabel(it).toLowerCase().includes(q));
  }, [items, q, getLabel, matches]);

  const buttonLabel = selected ? getLabel(selected) : placeholder;
  const isEmpty = !selected;

  return (
    <div ref={ref} className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => !disabled && setOpen((s) => !s)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-required={required}
        className="w-full text-[13px] px-2.5 py-1.5 rounded-md inline-flex items-center justify-between gap-2 transition-colors text-left"
        style={{
          backgroundColor: "var(--ink-3)",
          color: isEmpty ? "var(--fg-subtle)" : "var(--fg)",
          border: required && isEmpty
            ? "1.5px solid var(--rose-border)"
            : "1px solid var(--b-soft)",
          opacity: disabled ? 0.5 : 1,
          cursor: disabled ? "not-allowed" : "pointer",
        }}
      >
        <span
          className="truncate"
          style={{ flex: 1, minWidth: 0 }}
        >
          {buttonLabel}
        </span>
        <span aria-hidden className="text-[10px] text-[color:var(--fg-subtle)]">
          ▾
        </span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute top-full mt-1.5 z-30 rounded-md"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
            width: `${width}px`,
            [align === "right" ? "right" : "left"]: 0,
          }}
        >
          <div
            className="p-2"
            style={{ borderBottom: "1px solid var(--b-soft)" }}
          >
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              data-form-type="other"
              name="searchable-select-query"
              className="w-full text-[12.5px] px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11.5px] text-[color:var(--fg-subtle)] text-center">
                {emptyLabel}
              </div>
            ) : (
              filtered.map((it) => {
                const k = getKey(it);
                const isCurrent = k === value;
                const secondary = getSecondary?.(it) ?? null;
                return (
                  <button
                    key={String(k)}
                    type="button"
                    onClick={() => {
                      onChange(k);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--ink-4)] transition-colors"
                    style={{
                      backgroundColor: isCurrent
                        ? "var(--ink-4)"
                        : undefined,
                      borderLeft: isCurrent
                        ? "2px solid var(--mint-300)"
                        : "2px solid transparent",
                    }}
                  >
                    <div
                      className="text-[12.5px] truncate"
                      style={{
                        color: isCurrent ? "var(--mint-200)" : "var(--fg)",
                      }}
                    >
                      {getLabel(it)}
                      {isCurrent && (
                        <span
                          className="ml-1.5 text-[10px]"
                          style={{ color: "var(--mint-300)" }}
                        >
                          ✓
                        </span>
                      )}
                    </div>
                    {secondary && (
                      <div className="text-[10.5px] text-[color:var(--fg-subtle)] truncate numerics">
                        {secondary}
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

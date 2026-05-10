"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/** Shape mínimo que cada coluna precisa expor pra aparecer no picker. */
export type PickerColDef<K extends string> = {
  key: K;
  label: string;
};

/** Dropdown pra mostrar/esconder colunas da tabela. Tem search,
 *  "Exibir todas" / "Esconder todas", lista alfabética, click fora pra
 *  fechar. Genérico via TypeScript. */
export function ColumnPicker<K extends string>({
  allDefs,
  hidden,
  onToggle,
  onShowAll,
  onHideAll,
}: {
  allDefs: PickerColDef<K>[];
  hidden: Set<K>;
  onToggle: (k: K) => void;
  onShowAll: () => void;
  onHideAll: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
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
      window.setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setQuery("");
    }
  }, [open]);

  const sortedDefs = useMemo(
    () =>
      [...allDefs].sort((a, b) =>
        a.label.localeCompare(b.label, "pt-BR", { sensitivity: "base" }),
      ),
    [allDefs],
  );
  const q = query.trim().toLowerCase();
  const filtered = q
    ? sortedDefs.filter((d) => d.label.toLowerCase().includes(q))
    : sortedDefs;
  const visibleCount = allDefs.length - hidden.size;

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 transition-colors"
        style={{
          backgroundColor: "var(--ink-3)",
          color: open ? "var(--mint-300)" : "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
          height: "26px",
        }}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span aria-hidden className="text-[10px]">⊞</span>
        <span>Colunas</span>
        <span className="text-[10.5px] text-[color:var(--fg-subtle)]">
          {visibleCount}/{allDefs.length}
        </span>
        <span aria-hidden className="text-[9px]">▾</span>
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full mt-1.5 z-30 w-[280px] rounded-md"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
          }}
        >
          <div
            className="p-2 space-y-2"
            style={{ borderBottom: "1px solid var(--b-soft)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar coluna..."
              className="w-full text-[12.5px] px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onShowAll}
                className="flex-1 text-[11px] px-2 py-1 rounded transition-colors hover:text-[color:var(--mint-300)]"
                style={{
                  backgroundColor: "var(--ink-3)",
                  color: "var(--fg-muted)",
                  border: "1px solid var(--b-soft)",
                }}
              >
                Exibir todas
              </button>
              <button
                type="button"
                onClick={onHideAll}
                className="flex-1 text-[11px] px-2 py-1 rounded transition-colors hover:text-[color:var(--mint-300)]"
                style={{
                  backgroundColor: "var(--ink-3)",
                  color: "var(--fg-muted)",
                  border: "1px solid var(--b-soft)",
                }}
              >
                Esconder todas
              </button>
            </div>
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11.5px] text-[color:var(--fg-subtle)] text-center">
                Nenhuma coluna.
              </div>
            ) : (
              filtered.map((d) => {
                const isVisible = !hidden.has(d.key);
                return (
                  <label
                    key={d.key}
                    className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[color:var(--ink-3)]"
                  >
                    <input
                      type="checkbox"
                      checked={isVisible}
                      onChange={() => onToggle(d.key)}
                      className="accent-[color:var(--mint-300)]"
                    />
                    <span
                      className="text-[12.5px]"
                      style={{
                        color: isVisible
                          ? "var(--fg)"
                          : "var(--fg-subtle)",
                      }}
                    >
                      {d.label}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div
            className="p-2 flex items-center justify-end"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-[11px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
            >
              Fechar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

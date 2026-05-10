"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { ColumnDef } from "./table-columns";

export type { ColumnDef };

export function TableHeader({
  shown,
  total,
  isQuery,
  itemLabel,
  allColumns,
  visibleCols,
  newAction,
  extraActions,
}: {
  shown: number;
  total: number;
  isQuery: boolean;
  itemLabel: { singular: string; plural: string };
  allColumns: ColumnDef[];
  visibleCols: string[];
  newAction?: { label: string; href?: string; onClick?: () => void } | null;
  extraActions?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function pushCols(cols: string[]) {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (cols.length === 0) {
      // Sentinel para representar "nenhuma coluna" sem cair no default.
      next.set("cols", "__none__");
    } else {
      next.set("cols", cols.join(","));
    }
    router.replace(`${pathname}?${next.toString()}`);
  }

  function toggle(key: string) {
    const has = visibleCols.includes(key);
    const next = has
      ? visibleCols.filter((k) => k !== key)
      : [...visibleCols, key];
    pushCols(next);
  }

  function selectAll() {
    pushCols(allColumns.map((c) => c.key));
  }

  function clearAll() {
    pushCols([]);
  }

  // Auto-foca search ao abrir
  useEffect(() => {
    if (pickerOpen) {
      const t = setTimeout(() => filterRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    setFilter("");
  }, [pickerOpen]);

  const filteredColumns = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return allColumns;
    return allColumns.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.key.toLowerCase().includes(q) ||
        c.type.toLowerCase().includes(q),
    );
  }, [allColumns, filter]);

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-[12px] text-[color:var(--fg-muted)]">
        {isQuery
          ? `${shown} de ${total} ${itemLabel.plural}`
          : `${total} ${total === 1 ? itemLabel.singular : itemLabel.plural}`}
      </p>
      <div className="flex items-center gap-2" ref={ref}>
        {extraActions}
        <div className="relative">
          <button
            type="button"
            onClick={() => setPickerOpen((s) => !s)}
            className="text-[12px] px-3 py-1.5 rounded-md flex items-center gap-1.5"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <svg
              aria-hidden
              className="size-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
            Colunas ({visibleCols.length})
          </button>
          {pickerOpen && (
            <div
              className="absolute right-0 mt-1.5 w-72 rounded-md z-20 flex flex-col"
              style={{
                backgroundColor: "var(--ink-2)",
                border: "1px solid var(--b-base)",
                boxShadow: "var(--glow-md)",
                maxHeight: "min(400px, 70vh)",
              }}
            >
              <div
                className="px-3 py-2 flex items-center justify-between gap-2"
                style={{ borderBottom: "1px solid var(--b-soft)" }}
              >
                <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                  Colunas {visibleCols.length}/{allColumns.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={selectAll}
                    disabled={visibleCols.length === allColumns.length}
                    className="text-[10.5px] px-1.5 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Marcar todas"
                  >
                    todas
                  </button>
                  <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={visibleCols.length === 0}
                    className="text-[10.5px] px-1.5 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[#fca5a5] disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Desmarcar todas"
                  >
                    limpar
                  </button>
                </div>
              </div>

              <div
                className="px-2.5 py-2"
                style={{ borderBottom: "1px solid var(--b-soft)" }}
              >
                <div className="relative">
                  <svg
                    aria-hidden
                    className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ color: "var(--fg-subtle)" }}
                  >
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  <input
                    ref={filterRef}
                    type="text"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder="Buscar coluna..."
                    className="w-full rounded-[6px] py-[6px] pl-7 pr-2 text-[12px] focus:outline-none"
                    style={{
                      backgroundColor: "var(--ink-3)",
                      color: "var(--fg)",
                      border: "1px solid var(--b-soft)",
                    }}
                  />
                </div>
              </div>

              <div className="overflow-auto flex-1">
                {filteredColumns.length === 0 ? (
                  <p className="px-3 py-4 text-[12px] text-center text-[color:var(--fg-subtle)]">
                    Nenhuma coluna corresponde a "{filter}".
                  </p>
                ) : (
                  <ul>
                    {filteredColumns.map((col) => {
                      const checked = visibleCols.includes(col.key);
                      return (
                        <li key={col.key}>
                          <label className="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-[color:var(--ink-3)] text-[12.5px]">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(col.key)}
                              className="size-3.5 accent-[color:var(--mint-400)]"
                            />
                            <span className="text-[color:var(--fg)] flex-1 truncate">
                              {col.label}
                            </span>
                            <span className="text-[10px] text-[color:var(--fg-subtle)]">
                              {col.type}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
        {newAction &&
          (newAction.href ? (
            <a
              href={newAction.href}
              className="chip chip-mint text-[12px] px-3 py-1.5"
            >
              {newAction.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={newAction.onClick}
              className="chip chip-mint text-[12px] px-3 py-1.5"
            >
              {newAction.label}
            </button>
          ))}
      </div>
    </div>
  );
}


"use client";

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZE_OPTIONS)[number];

/** Paginação genérica pra tabelas. Mostra page size selector +
 *  prev/next + indicador de página. Persistir o pageSize fica a cargo
 *  do consumer via prop controlada + localStorage opcional. */
export function TablePagination({
  total,
  pageSize,
  pageIndex,
  onPageSizeChange,
  onPageIndexChange,
}: {
  total: number;
  pageSize: PageSize;
  pageIndex: number;
  onPageSizeChange: (n: PageSize) => void;
  onPageIndexChange: (n: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safeIndex = Math.min(Math.max(0, pageIndex), totalPages - 1);
  const start = total === 0 ? 0 : safeIndex * pageSize + 1;
  const end = Math.min(total, (safeIndex + 1) * pageSize);

  function go(n: number) {
    onPageIndexChange(Math.min(Math.max(0, n), totalPages - 1));
  }

  return (
    <div className="flex items-center gap-3 flex-wrap text-[11.5px]">
      <div className="flex items-center gap-2 text-[color:var(--fg-subtle)]">
        <span>Linhas por página:</span>
        <select
          value={pageSize}
          onChange={(e) => {
            const n = Number(e.target.value) as PageSize;
            onPageSizeChange(n);
            onPageIndexChange(0);
          }}
          className="text-[11.5px] px-1.5 py-0.5 rounded"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
            color: "var(--fg)",
            outline: "none",
          }}
        >
          {PAGE_SIZE_OPTIONS.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1.5 text-[color:var(--fg-muted)]">
        <button
          type="button"
          onClick={() => go(0)}
          disabled={safeIndex === 0}
          aria-label="Primeira página"
          title="Primeira"
          className="px-2 py-0.5 rounded transition-colors hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
          }}
        >
          ‹‹
        </button>
        <button
          type="button"
          onClick={() => go(safeIndex - 1)}
          disabled={safeIndex === 0}
          aria-label="Anterior"
          title="Anterior"
          className="px-2 py-0.5 rounded transition-colors hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
          }}
        >
          ‹
        </button>
        <span className="px-1.5 numerics">
          {safeIndex + 1} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => go(safeIndex + 1)}
          disabled={safeIndex >= totalPages - 1}
          aria-label="Próxima"
          title="Próxima"
          className="px-2 py-0.5 rounded transition-colors hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
          }}
        >
          ›
        </button>
        <button
          type="button"
          onClick={() => go(totalPages - 1)}
          disabled={safeIndex >= totalPages - 1}
          aria-label="Última página"
          title="Última"
          className="px-2 py-0.5 rounded transition-colors hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:cursor-not-allowed"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
          }}
        >
          ››
        </button>
      </div>

      <span
        className="numerics"
        style={{ color: "var(--fg-subtle)" }}
      >
        {total === 0 ? "0–0" : `${start}–${end}`} de {total}
      </span>
    </div>
  );
}

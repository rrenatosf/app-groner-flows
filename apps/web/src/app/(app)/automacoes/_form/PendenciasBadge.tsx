"use client";

/** Badge compacto pra indicar pendências (campos vazios). Verde quando
 *  zero, terracota quando tem pendências. */
export function PendenciasBadge({ count }: { count: number }) {
  const ok = count === 0;
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px]"
      style={{
        backgroundColor: ok ? "var(--ink-3)" : "var(--rose-bg)",
        color: ok ? "var(--mint-300)" : "var(--rose-300)",
        border: ok
          ? "1px solid var(--b-soft)"
          : "1px solid var(--rose-border)",
      }}
      title={ok ? "Sem pendências" : `${count} campo(s) vazio(s)`}
    >
      {ok ? "ok" : `${count} pend.`}
    </span>
  );
}

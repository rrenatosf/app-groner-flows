"use client";

import { useEffect, useRef, useState } from "react";

const STORAGE_ORDER = "groner.clientes.col_order_v1";

/**
 * Bolinha "ⓘ" ao lado do título da página. Mostra contexto da tela
 * + dicas de uso da tabela (drag pra reordenar, click pra sort) +
 * ação "ordem padrão". Click pra abrir/fechar; click fora ou Esc
 * fecham.
 */
export function ClientesHelpTip({
  contexto,
}: {
  contexto: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  function resetOrder() {
    try {
      localStorage.removeItem(STORAGE_ORDER);
    } catch {
      /* ignore */
    }
    // Notifica a tabela via storage event (não dispara na própria aba —
    // emitimos manualmente via custom event).
    window.dispatchEvent(new Event("groner:clientes-reset-order"));
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        aria-label="Dicas da tabela"
        title="Dicas da tabela"
        onClick={() => setOpen((s) => !s)}
        className="size-6 rounded-full inline-flex items-center justify-center text-[12px] transition-colors"
        style={{
          backgroundColor: "var(--ink-2)",
          color: open ? "var(--mint-300)" : "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
        }}
      >
        ⓘ
      </button>
      {open && (
        <div
          role="tooltip"
          className="absolute left-0 top-full mt-2 z-30 w-[460px] max-w-[90vw] rounded-md p-4 space-y-3"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
          }}
        >
          <div>
            <p className="label-eyebrow mb-1.5">Sobre essa tela</p>
            <p className="text-[12.5px] text-[color:var(--fg-muted)] leading-relaxed">
              {contexto}
            </p>
          </div>

          <div
            className="pt-3"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            <p className="label-eyebrow mb-1.5">Como usar a tabela</p>
            <ul className="text-[12.5px] text-[color:var(--fg-muted)] leading-relaxed space-y-1">
              <li>
                <span className="text-[color:var(--mint-300)]">⋮⋮</span>{" "}
                Arraste o cabeçalho de uma coluna pra trocar a ordem.
              </li>
              <li>
                <span className="text-[color:var(--mint-300)]">↑↓</span>{" "}
                Click no nome da coluna pra ordenar (toggle).
              </li>
              <li>
                <span className="text-[color:var(--mint-300)]">✎</span>{" "}
                Click numa célula pra selecionar; click no lápis (ou Enter) pra editar.
              </li>
              <li>
                <span className="text-[color:var(--mint-300)]">← ↑ → ↓</span>{" "}
                Navegam entre células.{" "}
                <span className="text-[color:var(--mint-300)]">S</span>{" "}
                seleciona/desseleciona a linha.
              </li>
              <li>A ordem é lembrada neste navegador (localStorage).</li>
            </ul>
          </div>

          <div
            className="pt-3"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            <button
              type="button"
              onClick={resetOrder}
              className="text-[11.5px] text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)]"
            >
              ↺ restaurar ordem padrão
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

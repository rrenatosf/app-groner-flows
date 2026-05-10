"use client";

import { useEffect, useState, useTransition } from "react";
import {
  validateAgendaUsuarioAction,
  validateAgendaTodosAction,
} from "./agenda-actions";
import {
  CONEXAO_DESCRICOES,
  CONEXAO_LABELS,
  PERMISSAO_DESCRICOES,
  PERMISSAO_LABELS,
  corConexao,
  corPermissao,
  type ResultadoAgenda,
} from "@/lib/agenda";

const BULK_EVENT = "agenda:bulk-result";

export function AgendaCell({ id }: { id: number }) {
  const [resultado, setResultado] = useState<ResultadoAgenda | null>(null);
  const [pending, start] = useTransition();

  function check(e: React.MouseEvent) {
    e.stopPropagation();
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      const r = await validateAgendaUsuarioAction(fd);
      setResultado(r);
    });
  }

  useEffect(() => {
    function handler(e: Event) {
      const ev = e as CustomEvent<{ resultados: ResultadoAgenda[] }>;
      const r = ev.detail.resultados.find((x) => x.id === id);
      if (r) setResultado(r);
    }
    window.addEventListener(BULK_EVENT, handler);
    return () => window.removeEventListener(BULK_EVENT, handler);
  }, [id]);

  if (resultado === null) {
    return (
      <button
        type="button"
        onClick={check}
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded-md disabled:opacity-50"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg-subtle)",
          border: "1px solid var(--b-soft)",
        }}
        title="Validar conexão e permissão da agenda Google"
      >
        {pending ? "..." : "verificar"}
      </button>
    );
  }

  const cc = corConexao(resultado.conexao);
  const cp = corPermissao(resultado.permissao);
  const detail = resultado.detail ? `\n\nDetalhe: ${resultado.detail}` : "";

  return (
    <button
      type="button"
      onClick={check}
      disabled={pending}
      className="inline-flex items-center gap-1 disabled:opacity-50"
      title={`Click para revalidar`}
    >
      <span
        title={`Conexão: ${CONEXAO_LABELS[resultado.conexao]} — ${CONEXAO_DESCRICOES[resultado.conexao]}${detail}`}
        className="text-[10.5px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
        style={{
          backgroundColor: cc.bg,
          color: cc.fg,
          border: `1px solid ${cc.border}`,
        }}
      >
        <span aria-hidden>{cc.glyph}</span>
        <span>{CONEXAO_LABELS[resultado.conexao]}</span>
      </span>
      <span
        title={`Permissão: ${PERMISSAO_LABELS[resultado.permissao]} — ${PERMISSAO_DESCRICOES[resultado.permissao]}${detail}`}
        className="text-[10.5px] inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md"
        style={{
          backgroundColor: cp.bg,
          color: cp.fg,
          border: `1px solid ${cp.border}`,
        }}
      >
        <span aria-hidden>{cp.glyph}</span>
        <span>{PERMISSAO_LABELS[resultado.permissao]}</span>
      </span>
    </button>
  );
}

/** Botão no header da tabela. Valida todos em paralelo e dispara evento
 *  para cada AgendaCell atualizar seu badge. Sem resumo agregado. */
export function ValidarTodasAgendasButton() {
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const r = await validateAgendaTodosAction();
      window.dispatchEvent(
        new CustomEvent(BULK_EVENT, { detail: { resultados: r } }),
      );
    });
  }

  return (
    <button
      type="button"
      onClick={run}
      disabled={pending}
      className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
      style={{
        backgroundColor: "var(--ink-2)",
        color: "var(--fg-muted)",
        border: "1px solid var(--b-soft)",
      }}
      title="Validar agenda Google de todos os vendedores ativos"
    >
      {pending ? "Validando..." : "Validar agendas"}
    </button>
  );
}

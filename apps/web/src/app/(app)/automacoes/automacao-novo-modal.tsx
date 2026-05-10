"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import { createAutomacao, type CreateAutomacaoInput } from "./actions";
import { getDefaultAutomacaoConfig } from "./dados-config-shape";
import type { LojaOption } from "./automacoes-table";

export function AutomacaoNovoModal({
  open,
  isSuper,
  clientes,
  lojas,
  onClose,
}: {
  open: boolean;
  isSuper: boolean;
  clientes: { id: number; nome: string }[];
  lojas: LojaOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (open) {
      setForm({});
      setErr(null);
      setIsActive(true);
      setClienteId(clientes.length === 1 ? clientes[0].id : null);
      setLojaId(null);
    }
  }, [open, clientes]);

  // Quando troca cliente, limpa lojaId.
  useEffect(() => {
    setLojaId(null);
  }, [clienteId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lojas filtradas pelo cliente selecionado.
  const lojasDoCliente = useMemo(
    () => (clienteId === null ? [] : lojas.filter((l) => l.clienteId === clienteId)),
    [lojas, clienteId],
  );

  if (!open) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (clienteId === null) {
      setErr("Selecione o cliente.");
      return;
    }
    if (!lojaId) {
      setErr("Selecione a loja.");
      return;
    }
    const input: CreateAutomacaoInput = {
      clienteId,
      lojaId,
      nome: form.nome ?? "",
      descricao: form.descricao || null,
      baseUrl: form.baseUrl || null,
      n8nWorkflowId: form.n8nWorkflowId || null,
      versao: form.versao || null,
      isActive,
      // dados_configuracoes nasce com template canônico (Bloco G):
      // 3 grupos — dados_de_configuração, coluna_inicial, coluna_qualificacao.
      dadosConfiguracoes: getDefaultAutomacaoConfig(),
    };
    startTransition(async () => {
      const res = await createAutomacao(input);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backgroundColor: "rgba(2,8,5,0.62)",
        backdropFilter: "blur(2px)",
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-[680px] max-h-[90vh] overflow-y-auto rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="label-eyebrow">Nova</div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)]">
              Cadastro de automação
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-[16px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
          >
            ✕
          </button>
        </div>

        {err && (
          <div
            className="px-5 py-2 text-[12px]"
            style={{
              backgroundColor: "var(--amber-bg)",
              color: "var(--amber-300)",
              borderBottom: "1px solid var(--amber-border)",
            }}
          >
            {err}
          </div>
        )}

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isSuper && clientes.length > 1 && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Cliente *
              </span>
              <SearchableSelect<{ id: number; nome: string }, number>
                items={clientes}
                value={clienteId}
                onChange={setClienteId}
                getKey={(c) => c.id}
                getLabel={(c) => c.nome}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente..."
                required
                disabled={pending}
                width={400}
              />
            </label>
          )}

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Loja *
            </span>
            <SearchableSelect<LojaOption, string>
              items={lojasDoCliente}
              value={lojaId}
              onChange={setLojaId}
              getKey={(l) => l.id}
              getLabel={(l) => l.nome}
              placeholder={
                clienteId === null
                  ? "Selecione o cliente primeiro"
                  : "Selecione a loja"
              }
              searchPlaceholder="Buscar loja..."
              required
              disabled={pending || clienteId === null}
              width={400}
            />
            {clienteId !== null && lojasDoCliente.length === 0 && (
              <span
                className="text-[11px] mt-1 px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--amber-bg)",
                  color: "var(--amber-300)",
                  border: "1px solid var(--amber-border)",
                }}
              >
                Esse cliente ainda não tem lojas cadastradas. Cadastre uma
                loja antes de criar automação.
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Nome *
            </span>
            <input
              type="text"
              value={form.nome ?? ""}
              onChange={(e) => set("nome", e.target.value)}
              required
              disabled={pending}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Descrição
            </span>
            <input
              type="text"
              value={form.descricao ?? ""}
              onChange={(e) => set("descricao", e.target.value)}
              disabled={pending}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Base URL (n8n)
            </span>
            <input
              type="text"
              value={form.baseUrl ?? ""}
              onChange={(e) => set("baseUrl", e.target.value)}
              disabled={pending}
              placeholder="https://n8n.dominio.com"
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              ID workflow n8n
            </span>
            <input
              type="text"
              value={form.n8nWorkflowId ?? ""}
              onChange={(e) => set("n8nWorkflowId", e.target.value)}
              disabled={pending}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Versão
            </span>
            <input
              type="text"
              value={form.versao ?? ""}
              onChange={(e) => set("versao", e.target.value)}
              disabled={pending}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={pending}
              className="accent-[color:var(--mint-300)]"
            />
            <span className="text-[12.5px] text-[color:var(--fg-muted)]">
              Automação ativa
            </span>
          </label>
        </div>

        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-[12px] px-3 py-1.5 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={
              pending || clienteId === null || !lojaId || !form.nome?.trim()
            }
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{
              opacity:
                clienteId === null || !lojaId || !form.nome?.trim() ? 0.5 : 1,
            }}
          >
            {pending ? "Criando…" : "Criar automação"}
          </button>
        </div>
      </form>
    </div>
  );
}

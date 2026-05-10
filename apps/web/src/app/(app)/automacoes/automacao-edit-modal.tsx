"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import {
  deleteAutomacao,
  updateAutomacaoConfiguracoes,
  updateAutomacaoFields,
  type UpdateAutomacaoPartial,
} from "./actions";
import {
  validateDadosConfiguracoes,
  getDefaultAutomacaoConfig,
} from "./dados-config-shape";
import type {
  AutomacaoRowFull,
  LojaOption,
} from "./automacoes-table";
import { pendenciasFor } from "./saude-automacao";

type Tab = "dados" | "config" | "vinculo";

export function AutomacaoEditModal({
  open,
  target,
  isSuper,
  canEdit,
  lojas,
  onClose,
}: {
  open: boolean;
  target: AutomacaoRowFull | null;
  isSuper: boolean;
  canEdit: boolean;
  lojas: LojaOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dados");
  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [lojaId, setLojaId] = useState<string | null>(null);
  // Configurações (jsonb) — texto pretty-printed editável.
  const [configText, setConfigText] = useState("[]");
  const [configValid, setConfigValid] = useState(true);
  const [configErr, setConfigErr] = useState<string | null>(null);
  // Sinaliza que a automação tinha config vazia ao abrir o modal — usado pra
  // mostrar hint no textarea ("template aplicado, clique salvar pra persistir").
  const [wasEmptyOnOpen, setWasEmptyOnOpen] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTab("dados");
      setErr(null);
      setForm({
        nome: target.nome ?? "",
        descricao: target.descricao ?? "",
        baseUrl: target.baseUrl ?? "",
        n8nWorkflowId: target.n8nWorkflowId ?? "",
        versao: target.versao ?? "",
      });
      setIsActive(!!target.isActive);
      setLojaId(target.lojaId ?? null);
      const cfg = Array.isArray(target.dadosConfiguracoes)
        ? target.dadosConfiguracoes
        : [];
      // Migração transparente: se a automação está com config vazia (legado),
      // popula textarea com template canônico já no abrir. NÃO grava no banco
      // até o user clicar em Salvar — preservamos o gesto explícito.
      const isEmpty = cfg.length === 0;
      setWasEmptyOnOpen(isEmpty);
      const initial = isEmpty ? getDefaultAutomacaoConfig() : cfg;
      try {
        setConfigText(JSON.stringify(initial, null, 2));
      } catch {
        setConfigText("[]");
      }
      setConfigValid(true);
      setConfigErr(null);
    }
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pendencias = useMemo(
    () => (target ? pendenciasFor(target) : []),
    [target],
  );

  // Lojas do mesmo cliente (única visão permitida pra trocar vínculo).
  const lojasDoCliente = useMemo(
    () =>
      target ? lojas.filter((l) => l.clienteId === target.clienteId) : [],
    [lojas, target],
  );

  if (!open || !target) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function validateConfig(): { ok: true; v: unknown } | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(configText);
    } catch (e) {
      return {
        ok: false,
        error: `JSON inválido: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const v = validateDadosConfiguracoes(parsed);
    if (!v.ok) return { ok: false, error: v.error };
    return { ok: true, v: v.v };
  }

  function handleValidateClick() {
    const res = validateConfig();
    if (!res.ok) {
      setConfigValid(false);
      setConfigErr(res.error);
    } else {
      setConfigValid(true);
      setConfigErr(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErr(null);

    // Salvar Dados (aba dados): nome/descricao/baseUrl/n8nWorkflowId/versao/isActive.
    const patch: UpdateAutomacaoPartial = {
      nome: form.nome ?? "",
      descricao: form.descricao || null,
      baseUrl: form.baseUrl || null,
      n8nWorkflowId: form.n8nWorkflowId || null,
      versao: form.versao || null,
      isActive,
    };
    if (lojaId && lojaId !== target.lojaId) {
      patch.lojaId = lojaId;
    }

    // Validar e salvar configurações também (se tab config tem JSON).
    const cfgRes = validateConfig();
    if (!cfgRes.ok) {
      setTab("config");
      setConfigValid(false);
      setConfigErr(cfgRes.error);
      setErr("Configurações inválidas — corrija antes de salvar.");
      return;
    }
    setConfigValid(true);
    setConfigErr(null);

    // Só dispara updateConfiguracoes se houve mudança real — evita
    // write extra no Postgres + revalidatePath redundante.
    const cfgPrev = JSON.stringify(target.dadosConfiguracoes ?? []);
    const cfgNext = JSON.stringify(cfgRes.v);
    const cfgChanged = cfgPrev !== cfgNext;

    startTransition(async () => {
      const res = await updateAutomacaoFields(target.id, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      if (cfgChanged) {
        const cfgSave = await updateAutomacaoConfiguracoes(
          target.id,
          cfgRes.v,
        );
        if (!cfgSave.ok) {
          setErr(cfgSave.error);
          return;
        }
      }
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!target) return;
    if (
      !confirm(`Remover a automação "${target.nome ?? "(sem nome)"}"?`)
    )
      return;
    startTransition(async () => {
      const res = await deleteAutomacao(target.id);
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
        className="w-full max-w-[820px] max-h-[92vh] overflow-y-auto rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="label-eyebrow">
              Automação{" "}
              {isSuper ? `· ${target.clienteNome ?? "—"}` : ""}
            </div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)] truncate">
              {target.nome ?? "(sem nome)"}
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

        <div
          className="px-5 pt-3 flex items-center gap-1"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <TabButton active={tab === "dados"} onClick={() => setTab("dados")}>
            Dados
            {pendencias.length > 0 && (
              <span
                className="ml-1.5 px-1.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                {pendencias.length}
              </span>
            )}
          </TabButton>
          <TabButton
            active={tab === "config"}
            onClick={() => setTab("config")}
          >
            Configurações
            {!configValid && (
              <span
                className="ml-1.5 px-1.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                !
              </span>
            )}
          </TabButton>
          <TabButton
            active={tab === "vinculo"}
            onClick={() => setTab("vinculo")}
          >
            Vínculo
          </TabButton>
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

        {tab === "dados" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldText
              name="nome"
              label="Nome *"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="descricao"
              label="Descrição"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="baseUrl"
              label="Base URL (n8n)"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="n8nWorkflowId"
              label="ID workflow n8n"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="versao"
              label="Versão"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending || !canEdit}
                className="accent-[color:var(--mint-300)]"
              />
              <span className="text-[12.5px] text-[color:var(--fg-muted)]">
                Automação ativa
              </span>
            </label>
          </div>
        )}

        {tab === "config" && (
          <div className="p-5 space-y-2">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Configurações (JSON — array de objetos com 1 chave por
                grupo)
              </span>
              {wasEmptyOnOpen && (
                <div
                  className="text-[11px] px-3 py-2 rounded-md"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--b-base)",
                  }}
                >
                  <span aria-hidden style={{ color: "var(--mint-300)" }}>✓</span>{" "}
                  Template aplicado automaticamente — config estava vazia.
                  Clique Salvar pra persistir.
                </div>
              )}
              <textarea
                value={configText}
                onChange={(e) => {
                  setConfigText(e.target.value);
                  setConfigValid(true);
                  setConfigErr(null);
                }}
                disabled={pending || !canEdit}
                rows={18}
                spellCheck={false}
                className="text-[12.5px] px-2.5 py-1.5 rounded-md"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: configValid
                    ? "1px solid var(--b-soft)"
                    : "1px solid var(--rose-border)",
                  color: "var(--fg)",
                  outline: "none",
                  resize: "vertical",
                  fontFamily:
                    "var(--font-geist-mono), ui-monospace, monospace",
                  lineHeight: "1.6",
                  minHeight: "320px",
                  tabSize: 2,
                }}
              />
            </label>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[color:var(--fg-subtle)]">
                Template padrão tem 3 grupos: dados_de_configuração,
                coluna_inicial, coluna_qualificacao. Cada item: objeto com 1
                chave (nome do grupo) e valor objeto.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = configText.trim();
                    const isEmpty = trimmed === "" || trimmed === "[]";
                    if (!isEmpty) {
                      if (
                        !confirm(
                          "Substituir configuração atual pelo template padrão?",
                        )
                      )
                        return;
                    }
                    setConfigText(
                      JSON.stringify(getDefaultAutomacaoConfig(), null, 2),
                    );
                    setConfigValid(true);
                    setConfigErr(null);
                  }}
                  disabled={pending || !canEdit}
                  className="text-[12px] px-3 py-1.5 rounded-md"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--b-soft)",
                  }}
                >
                  Aplicar template padrão
                </button>
                <button
                  type="button"
                  onClick={handleValidateClick}
                  disabled={pending}
                  className="text-[12px] px-3 py-1.5 rounded-md"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--b-soft)",
                  }}
                >
                  Validar
                </button>
              </div>
            </div>
            {!configValid && configErr && (
              <div
                className="text-[12px] px-3 py-2 rounded-md"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                {configErr}
              </div>
            )}
            {configValid && configErr === null && (
              <div
                className="text-[11px] px-3 py-2 rounded-md"
                style={{
                  backgroundColor: "var(--ink-3)",
                  color: "var(--fg-muted)",
                  border: "1px solid var(--b-base)",
                }}
              >
                <span aria-hidden style={{ color: "var(--mint-300)" }}>i</span>{" "}
                Use "Validar" pra checar o shape do JSON antes de salvar. Shape inválido bloqueia o save.
              </div>
            )}
          </div>
        )}

        {tab === "vinculo" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Loja vinculada *
              </span>
              <SearchableSelect<LojaOption, string>
                items={lojasDoCliente}
                value={lojaId}
                onChange={setLojaId}
                getKey={(l) => l.id}
                getLabel={(l) => l.nome}
                placeholder="Selecione a loja"
                searchPlaceholder="Buscar loja..."
                disabled={pending || !canEdit}
                width={400}
              />
              <p className="text-[11px] text-[color:var(--fg-subtle)] mt-0.5">
                Apenas lojas do mesmo cliente. Trocar de cliente exige criar
                automação nova.
              </p>
            </label>
            <div className="sm:col-span-2 grid grid-cols-2 gap-3 mt-2">
              <InfoBlock label="Cliente" value={target.clienteNome ?? "—"} />
              <InfoBlock label="ID" value={String(target.id)} />
            </div>
          </div>
        )}

        <div
          className="px-5 py-3 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <span className="text-[11px] text-[color:var(--fg-subtle)]">
            id: {target.id}
          </span>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="chip chip-red text-[12px] px-3 py-1.5"
              >
                Remover
              </button>
            )}
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
            {canEdit && (
              <button
                type="submit"
                disabled={pending || !configValid}
                className="chip chip-mint text-[12px] px-3 py-1.5"
                style={{ opacity: configValid ? 1 : 0.5 }}
                title={
                  !configValid
                    ? "Validar configurações antes de salvar"
                    : undefined
                }
              >
                {pending ? "Salvando…" : "Salvar"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] px-3 py-1.5 rounded-t-md inline-flex items-center"
      style={{
        backgroundColor: active ? "var(--ink-3)" : "transparent",
        color: active ? "var(--fg)" : "var(--fg-muted)",
        border: active ? "1px solid var(--b-soft)" : "1px solid transparent",
        borderBottom: active ? "1px solid var(--ink-3)" : undefined,
        marginBottom: "-1px",
      }}
    >
      {children}
    </button>
  );
}

function FieldText({
  name,
  label,
  type = "text",
  full,
  form,
  set,
  pending,
}: {
  name: string;
  label: string;
  type?: "text" | "number";
  full?: boolean;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  pending: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
        {label}
      </span>
      <input
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => set(name, e.target.value)}
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
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md p-3"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <div className="label-eyebrow">{label}</div>
      <div className="text-[13px] mt-1 numerics text-[color:var(--fg)]">
        {value}
      </div>
    </div>
  );
}

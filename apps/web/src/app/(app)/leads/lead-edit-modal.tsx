"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import {
  updateLeadFields,
  type UpdateLeadPartial,
  type VendedorOption,
} from "./actions";
import type { LeadRow } from "./saude-lead";
import { pendenciasFor } from "./saude-lead";

type Tab = "crm" | "atribuicao";

const dt = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

function fmtDate(v: Date | string | null | undefined): string {
  if (!v) return "—";
  try {
    return dt.format(new Date(v));
  } catch {
    return "—";
  }
}

/** Converte Date → string `YYYY-MM-DDTHH:MM` (input datetime-local). */
function toLocalInputValue(v: Date | string | null | undefined): string {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate(),
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function LeadEditModal({
  open,
  target,
  isSuper,
  canEdit,
  vendedores,
  onClose,
}: {
  open: boolean;
  target: LeadRow | null;
  isSuper: boolean;
  canEdit: boolean;
  vendedores: VendedorOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("crm");
  const [vendedorId, setVendedorId] = useState<number | null>(null);
  const [stepFollowup, setStepFollowup] = useState<string>("");
  const [statusFollowup, setStatusFollowup] = useState<string>("");
  const [proximoFollowup, setProximoFollowup] = useState<string>("");

  useEffect(() => {
    if (open && target) {
      setTab("crm");
      setErr(null);
      setVendedorId(target.vendedorId ?? null);
      setStepFollowup(
        target.stepFollowup !== null && target.stepFollowup !== undefined
          ? String(target.stepFollowup)
          : "",
      );
      setStatusFollowup(target.statusFollowup ?? "");
      setProximoFollowup(toLocalInputValue(target.proximoFollowup));
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

  if (!open || !target) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErr(null);
    const patch: UpdateLeadPartial = {
      vendedorId: vendedorId,
      stepFollowup:
        stepFollowup.trim() === "" ? null : Number(stepFollowup),
      statusFollowup:
        statusFollowup.trim() === "" ? null : statusFollowup.trim(),
      proximoFollowup:
        proximoFollowup.trim() === ""
          ? null
          : new Date(proximoFollowup).toISOString(),
    };
    startTransition(async () => {
      const res = await updateLeadFields(target.id, patch);
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
              Lead {isSuper ? `· ${target.clienteNome ?? "—"}` : ""}
            </div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)] truncate">
              {target.nome ?? `Lead #${target.id}`}
            </h2>
            {target.telefone && (
              <p className="text-[12px] text-[color:var(--fg-subtle)] mt-0.5 numerics">
                {target.telefone}
              </p>
            )}
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
          <TabButton active={tab === "crm"} onClick={() => setTab("crm")}>
            Identificação / CRM
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
            active={tab === "atribuicao"}
            onClick={() => setTab("atribuicao")}
          >
            {canEdit
              ? "Atribuição & Follow-up"
              : "Atribuição & Follow-up (somente leitura)"}
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

        {tab === "crm" && (
          <div className="p-5 space-y-4">
            <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
              Os campos abaixo vêm do CRM externo. São read-only no app —
              editar local cria drift que o webhook sobrescreve.
            </p>
            <section>
              <div className="label-eyebrow mb-2">Identificação</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadOnlyField label="Nome" value={target.nome ?? "—"} />
                <ReadOnlyField
                  label="Telefone"
                  value={target.telefone ?? "—"}
                />
                <ReadOnlyField
                  label="Recebido em"
                  value={fmtDate(target.createdAt)}
                />
              </div>
            </section>
            <section>
              <div className="label-eyebrow mb-2">CRM</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadOnlyField
                  label="Lead ID (CRM)"
                  value={target.leadId ?? "—"}
                />
                <ReadOnlyField
                  label="Projeto ID"
                  value={target.projetoId ?? "—"}
                />
                <ReadOnlyField label="Etapa" value={target.etapaNome ?? "—"} />
                <ReadOnlyField label="Etapa ID" value={target.etapaId ?? "—"} />
                <ReadOnlyField
                  label="Status"
                  value={target.statusNome ?? "—"}
                />
                <ReadOnlyField
                  label="Status ID"
                  value={target.statusId ?? "—"}
                />
              </div>
            </section>
            <section>
              <div className="label-eyebrow mb-2">Sessão WhatsApp / Agendamento</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <ReadOnlyField
                  label="Sessão"
                  value={target.sessionId ?? "—"}
                />
                <ReadOnlyField
                  label="Agendamento"
                  value={
                    target.agendamentoId !== null
                      ? `#${target.agendamentoId}`
                      : "—"
                  }
                />
              </div>
            </section>
          </div>
        )}

        {tab === "atribuicao" && (
          <div className="p-5 space-y-4">
            <section>
              <div className="label-eyebrow mb-2">Vendedor responsável</div>
              <SearchableSelect
                items={[
                  { id: 0, uid: "__none__", nome: "(IA atende — sem vendedor)", role: "vendedor" as const, is_active: true },
                  ...vendedores,
                ]}
                value={vendedorId ?? 0}
                onChange={(k) => setVendedorId(k === 0 ? null : (k as number))}
                getKey={(o) => o.id}
                getLabel={(o) =>
                  o.id === 0
                    ? o.nome
                    : `${o.nome}${o.role === "owner" ? " (admin)" : ""}${
                        !o.is_active ? " · inativo" : ""
                      }`
                }
                placeholder="Selecione vendedor…"
                searchPlaceholder="Buscar vendedor…"
                width={360}
                disabled={!canEdit || pending}
              />
              <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1.5">
                Snapshot do vendedor é gravado junto — preserva o nome
                mesmo se o vendedor for deletado depois.
              </p>
            </section>

            <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                  Tentativas (step)
                </span>
                <input
                  type="number"
                  step={1}
                  value={stepFollowup}
                  onChange={(e) => setStepFollowup(e.target.value)}
                  disabled={!canEdit || pending}
                  className="text-[13px] px-2.5 py-1.5 rounded-md numerics"
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
                  Status follow
                </span>
                <input
                  type="text"
                  value={statusFollowup}
                  onChange={(e) => setStatusFollowup(e.target.value)}
                  disabled={!canEdit || pending}
                  placeholder="Ex: aguardando, qualificado…"
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
                  Próximo follow
                </span>
                <input
                  type="datetime-local"
                  value={proximoFollowup}
                  onChange={(e) => setProximoFollowup(e.target.value)}
                  disabled={!canEdit || pending}
                  className="text-[13px] px-2.5 py-1.5 rounded-md numerics"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    border: "1px solid var(--b-soft)",
                    color: "var(--fg)",
                    outline: "none",
                  }}
                />
              </label>
            </section>
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
                disabled={pending}
                className="chip chip-mint text-[12px] px-3 py-1.5"
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
        border: active
          ? "1px solid var(--b-soft)"
          : "1px solid transparent",
        borderBottom: active ? "1px solid var(--ink-3)" : undefined,
        marginBottom: "-1px",
      }}
    >
      {children}
    </button>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
        {label}
      </span>
      <div
        className="text-[13px] px-2.5 py-1.5 rounded-md numerics"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px dashed var(--b-soft)",
          color: "var(--fg-muted)",
          minHeight: "32px",
          wordBreak: "break-word",
        }}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}

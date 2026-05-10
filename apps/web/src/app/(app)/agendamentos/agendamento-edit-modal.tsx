"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import {
  updateAgendamentoFields,
  type UpdateAgendamentoPartial,
} from "./actions";
import {
  pendenciasFor,
  type AgendamentoRow,
} from "./saude-agendamento";

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

export function AgendamentoEditModal({
  open,
  target,
  isSuper,
  canEdit,
  onClose,
}: {
  open: boolean;
  target: AgendamentoRow | null;
  isSuper: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [dataAgendamento, setDataAgendamento] = useState<string>("");
  const [statusAgendamento, setStatusAgendamento] = useState<string>("");
  const [observacaoAgendamento, setObservacaoAgendamento] = useState<string>("");
  const [initial, setInitial] = useState({
    dataAgendamento: "",
    statusAgendamento: "",
    observacaoAgendamento: "",
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open && target) {
      setErr(null);
      const next = {
        dataAgendamento: toLocalInputValue(target.dataAgendamento),
        statusAgendamento: target.statusAgendamento ?? "",
        observacaoAgendamento: target.observacaoAgendamento ?? "",
      };
      setDataAgendamento(next.dataAgendamento);
      setStatusAgendamento(next.statusAgendamento);
      setObservacaoAgendamento(next.observacaoAgendamento);
      setInitial(next);
    }
  }, [open, target]);

  const isDirty = useDirtyForm(
    initial,
    { dataAgendamento, statusAgendamento, observacaoAgendamento },
  );

  const pendencias = useMemo(
    () => (target ? pendenciasFor(target) : []),
    [target],
  );

  if (!open || !target) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErr(null);
    const patch: UpdateAgendamentoPartial = {
      dataAgendamento:
        dataAgendamento.trim() === ""
          ? null
          : new Date(dataAgendamento).toISOString(),
      statusAgendamento:
        statusAgendamento.trim() === "" ? null : statusAgendamento.trim(),
      observacaoAgendamento:
        observacaoAgendamento.trim() === ""
          ? null
          : observacaoAgendamento.trim(),
    };
    startTransition(async () => {
      const res = await updateAgendamentoFields(target.id, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={`Agendamento${isSuper ? ` · ${target.clienteNome ?? "—"}` : ""}${pendencias.length > 0 ? ` · ${pendencias.length} pendente${pendencias.length === 1 ? "" : "s"}` : ""}${target.leadTelefone ? ` · ${target.leadTelefone}` : ""}`}
      title={target.leadNome ?? `Lead #${target.leadId ?? "—"}`}
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            id: {target.id}
          </span>
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
              form="modal-form"
              disabled={pending}
              className="chip chip-mint text-[12px] px-3 py-1.5"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          )}
        </>
      }
    >
      <form id="modal-form" ref={formRef} onSubmit={submit}>
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

        <div className="p-5 space-y-4">
          <section>
            <div className="label-eyebrow mb-2">Contexto (read-only)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <ReadOnlyField
                label="Lead"
                value={target.leadNome ?? `#${target.leadId ?? "—"}`}
              />
              <ReadOnlyField
                label="Telefone"
                value={target.leadTelefone ?? "—"}
              />
              <ReadOnlyField
                label="Vendedor"
                value={target.vendedorNome ?? "(IA — sem vendedor)"}
              />
              <ReadOnlyField
                label="Criado em"
                value={fmtDate(target.createdAt)}
              />
            </div>
          </section>

          <section>
            <div className="label-eyebrow mb-2">Agendamento</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                  Data e hora
                </span>
                <input
                  type="datetime-local"
                  value={dataAgendamento}
                  onChange={(e) => setDataAgendamento(e.target.value)}
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
                  Status
                </span>
                <input
                  type="text"
                  value={statusAgendamento}
                  onChange={(e) => setStatusAgendamento(e.target.value)}
                  disabled={!canEdit || pending}
                  placeholder="Ex: agendado, confirmado, concluído…"
                  className="text-[13px] px-2.5 py-1.5 rounded-md"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    border: "1px solid var(--b-soft)",
                    color: "var(--fg)",
                    outline: "none",
                  }}
                />
              </label>
            </div>
          </section>

          <section>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Observação
              </span>
              <textarea
                rows={4}
                value={observacaoAgendamento}
                onChange={(e) => setObservacaoAgendamento(e.target.value)}
                disabled={!canEdit || pending}
                placeholder="Detalhes do agendamento (opcional)…"
                className="text-[13px] px-2.5 py-1.5 rounded-md"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: "1px solid var(--b-soft)",
                  color: "var(--fg)",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "inherit",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              />
            </label>
          </section>
        </div>

      </form>
    </ModalShell>
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

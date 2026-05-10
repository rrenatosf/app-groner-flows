"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import { createAgente, type CreateAgenteInput } from "./actions";

/** Handler Tab/Shift+Tab pra textarea YAML — indenta 2 espaços. */
function handleYamlTab(
  e: React.KeyboardEvent<HTMLTextAreaElement>,
  text: string,
  setText: (v: string) => void,
) {
  if (e.key !== "Tab") return;
  e.preventDefault();
  const ta = e.currentTarget;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const INDENT = "  ";
  if (e.shiftKey) {
    const before = text.slice(0, start);
    const lineStart = before.lastIndexOf("\n") + 1;
    const selection = text.slice(lineStart, end);
    const dedented = selection.replace(/^ {1,2}/gm, "");
    const removed = selection.length - dedented.length;
    const next = text.slice(0, lineStart) + dedented + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.selectionStart = Math.max(lineStart, start - Math.min(2, removed));
      ta.selectionEnd = end - removed;
    });
  } else if (start === end) {
    const next = text.slice(0, start) + INDENT + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.selectionStart = ta.selectionEnd = start + INDENT.length;
    });
  } else {
    const before = text.slice(0, start);
    const lineStart = before.lastIndexOf("\n") + 1;
    const selection = text.slice(lineStart, end);
    const indented = selection.replace(/^/gm, INDENT);
    const added = indented.length - selection.length;
    const next = text.slice(0, lineStart) + indented + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      ta.selectionStart = start + INDENT.length;
      ta.selectionEnd = end + added;
    });
  }
}

export function AgenteNovoModal({
  open,
  isSuper,
  clientes,
  onClose,
}: {
  open: boolean;
  isSuper: boolean;
  clientes: { id: number; nome: string }[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [humanIntervention, setHumanIntervention] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setForm({});
      setErr(null);
      setIsActive(true);
      setHumanIntervention(false);
      setClienteId(clientes.length === 1 ? clientes[0].id : null);
    }
  }, [open, clientes]);

  const isDirty = useDirtyForm(
    { form: {}, isActive: true, humanIntervention: false, clienteId: null as number | null },
    { form, isActive, humanIntervention, clienteId },
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
    const input: CreateAgenteInput = {
      clienteId,
      name: form.name ?? "",
      description: form.description || null,
      prompt: form.prompt || null,
      debounceTime: form.debounceTime ? Number(form.debounceTime) : 10,
      maxFollowups: form.maxFollowups ? Number(form.maxFollowups) : 5,
      humanIntervention,
      isActive,
      idN8n: form.idN8n || null,
      voiceGender: form.voiceGender || null,
    };
    startTransition(async () => {
      const res = await createAgente(input);
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
      eyebrow="Novo"
      title="Cadastro de agente"
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
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
            form="modal-form"
            disabled={pending || clienteId === null}
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{ opacity: clienteId === null ? 0.5 : 1 }}
          >
            {pending ? "Criando…" : "Criar agente"}
          </button>
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
              Nome *
            </span>
            <input
              type="text"
              value={form.name ?? ""}
              onChange={(e) => set("name", e.target.value)}
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
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
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
              Prompt (YAML)
            </span>
            <textarea
              rows={8}
              value={form.prompt ?? ""}
              onChange={(e) => set("prompt", e.target.value)}
              onKeyDown={(e) =>
                handleYamlTab(e, form.prompt ?? "", (v) => set("prompt", v))
              }
              disabled={pending}
              spellCheck={false}
              placeholder="identidade_agente: |&#10;  - Você é um SDR..."
              className="text-[12.5px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
                resize: "vertical",
                fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                lineHeight: "1.6",
                tabSize: 2,
              }}
            />
            <p className="text-[10.5px] text-[color:var(--fg-subtle)] mt-0.5">
              Tab indenta · Shift+Tab dedenta · fonte mono.
            </p>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Debounce (segundos)
            </span>
            <input
              type="number"
              value={form.debounceTime ?? "10"}
              onChange={(e) => set("debounceTime", e.target.value)}
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
              Máximo de follow-ups
            </span>
            <input
              type="number"
              value={form.maxFollowups ?? "5"}
              onChange={(e) => set("maxFollowups", e.target.value)}
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
              ID n8n (workflow)
            </span>
            <input
              type="text"
              value={form.idN8n ?? ""}
              onChange={(e) => set("idN8n", e.target.value)}
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
              Voz (opcional)
            </span>
            <input
              type="text"
              value={form.voiceGender ?? ""}
              onChange={(e) => set("voiceGender", e.target.value)}
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

          <label className="flex items-center gap-2 sm:col-span-1">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={pending}
              className="accent-[color:var(--mint-300)]"
            />
            <span className="text-[12.5px] text-[color:var(--fg-muted)]">
              Agente ativo
            </span>
          </label>
          <label className="flex items-center gap-2 sm:col-span-1">
            <input
              type="checkbox"
              checked={humanIntervention}
              onChange={(e) => setHumanIntervention(e.target.checked)}
              disabled={pending}
              className="accent-[color:var(--mint-300)]"
            />
            <span className="text-[12.5px] text-[color:var(--fg-muted)]">
              Intervenção humana
            </span>
          </label>
        </div>

      </form>
    </ModalShell>
  );
}

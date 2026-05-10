"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteAgente,
  updateAgenteFields,
  type UpdateAgentePartial,
} from "./actions";
import type { AgenteRowFull } from "./agentes-table";
import { pendenciasFor } from "./saude-agente";

type Tab = "info" | "prompt" | "config";

export function AgenteEditModal({
  open,
  target,
  isSuper,
  canEdit,
  onClose,
}: {
  open: boolean;
  target: AgenteRowFull | null;
  isSuper: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [humanIntervention, setHumanIntervention] = useState(false);

  useEffect(() => {
    if (open && target) {
      setTab("info");
      setErr(null);
      setForm({
        name: target.name ?? "",
        description: target.description ?? "",
        prompt: target.prompt ?? "",
        debounceTime: String(target.debounceTime ?? 10),
        maxFollowups: String(target.maxFollowups ?? 5),
        idN8n: target.idN8n ?? "",
        voiceGender: target.voiceGender ?? "",
      });
      setIsActive(target.isActive);
      setHumanIntervention(target.humanIntervention);
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

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErr(null);
    const patch: UpdateAgentePartial = {
      name: form.name ?? null,
      description: form.description || null,
      prompt: form.prompt || null,
      debounceTime: form.debounceTime
        ? Number(form.debounceTime)
        : 10,
      maxFollowups: form.maxFollowups ? Number(form.maxFollowups) : 5,
      idN8n: form.idN8n || null,
      voiceGender: form.voiceGender || null,
      isActive,
      humanIntervention,
    };
    startTransition(async () => {
      const res = await updateAgenteFields(target.id, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!target) return;
    if (
      !confirm(`Remover o agente "${target.name ?? "(sem nome)"}"?`)
    )
      return;
    startTransition(async () => {
      const res = await deleteAgente(target.id);
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
              Agente {isSuper ? `· ${target.clienteNome ?? "—"}` : ""}
            </div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)] truncate">
              {target.name ?? "(sem nome)"}
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
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            Identificação
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
          <TabButton active={tab === "prompt"} onClick={() => setTab("prompt")}>
            Prompt
          </TabButton>
          <TabButton active={tab === "config"} onClick={() => setTab("config")}>
            Configurações
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

        {tab === "info" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldText
              name="name"
              label="Nome"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="description"
              label="Descrição"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <label className="flex items-center gap-2 sm:col-span-1">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending || !canEdit}
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
                disabled={pending || !canEdit}
                className="accent-[color:var(--mint-300)]"
              />
              <span className="text-[12.5px] text-[color:var(--fg-muted)]">
                Intervenção humana
              </span>
            </label>
          </div>
        )}

        {tab === "prompt" && (
          <div className="p-5">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Prompt completo do agente (YAML)
              </span>
              <textarea
                value={form.prompt ?? ""}
                onChange={(e) => set("prompt", e.target.value)}
                onKeyDown={(e) => handleYamlTab(e, form.prompt ?? "", (v) => set("prompt", v))}
                disabled={pending || !canEdit}
                rows={20}
                placeholder="identidade_agente: |&#10;  - Você é um SDR..."
                spellCheck={false}
                className="text-[12.5px] px-2.5 py-1.5 rounded-md"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: "1px solid var(--b-soft)",
                  color: "var(--fg)",
                  outline: "none",
                  resize: "vertical",
                  fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                  lineHeight: "1.6",
                  minHeight: "400px",
                  tabSize: 2,
                }}
              />
              <p className="text-[11px] text-[color:var(--fg-subtle)] mt-1">
                Tab indenta 2 espaços · Shift+Tab dedenta · Fonte mono pra
                alinhamento YAML · {form.prompt?.length ?? 0} caracteres.
              </p>
            </label>
          </div>
        )}

        {tab === "config" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldText
              name="debounceTime"
              label="Debounce (segundos)"
              type="number"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="maxFollowups"
              label="Máximo de follow-ups"
              type="number"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="idN8n"
              label="ID n8n (workflow)"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="voiceGender"
              label="Voz (opcional)"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
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
                className="text-[12px] px-3 py-1.5 rounded-md"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
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

/** Handler de Tab/Shift+Tab pra textareas YAML.
 *  Tab insere 2 espaços (ou indenta linhas selecionadas).
 *  Shift+Tab remove até 2 espaços do começo das linhas selecionadas. */
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

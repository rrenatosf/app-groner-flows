"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modal-shell";
import { updateAgenteFields } from "./actions";
import type { AgenteRowFull } from "./agentes-table";

/** Modal grande dedicado pra visualizar/editar o prompt YAML do agente.
 *  Tab indenta 2 espaços, Shift+Tab dedenta. Fonte mono pra alinhamento. */
export function AgentePromptModal({
  open,
  target,
  canEdit,
  onClose,
}: {
  open: boolean;
  target: AgenteRowFull | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [dirty, setDirty] = useState(false);
  const [wrap, setWrap] = useState(true);

  useEffect(() => {
    if (open && target) {
      setText(target.prompt ?? "");
      setDirty(false);
      setErr(null);
    }
  }, [open, target]);

  if (!open || !target) return null;

  function onChange(v: string) {
    setText(v);
    setDirty(v !== (target?.prompt ?? ""));
  }

  function handleTab(e: React.KeyboardEvent<HTMLTextAreaElement>) {
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
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = Math.max(lineStart, start - Math.min(2, removed));
        ta.selectionEnd = end - removed;
      });
    } else if (start === end) {
      const next = text.slice(0, start) + INDENT + text.slice(end);
      onChange(next);
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
      onChange(next);
      requestAnimationFrame(() => {
        ta.selectionStart = start + INDENT.length;
        ta.selectionEnd = end + added;
      });
    }
  }

  function save() {
    if (!target) return;
    setErr(null);
    startTransition(async () => {
      const res = await updateAgenteFields(target.id, { prompt: text });
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setDirty(false);
      onClose();
      router.refresh();
    });
  }

  const lineCount = text.split("\n").length;
  const charCount = text.length;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={`Prompt · ${target.clienteNome ?? target.clienteTenant ?? "—"}`}
      title={target.name ?? "(sem nome)"}
      size="full"
      zIndex={55}
      isDirty={dirty}
      onSubmit={canEdit ? save : undefined}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            Tab indenta 2 espaços · Shift+Tab dedenta · Esc fecha
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
            {canEdit ? "Cancelar" : "Fechar"}
          </button>
          {canEdit && (
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="chip chip-mint text-[12px] px-3 py-1.5"
              style={{ opacity: !dirty ? 0.5 : 1 }}
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          )}
        </>
      }
    >
      <div
        className="px-5 pt-3 pb-2 flex items-center justify-end gap-3"
      >
        <div className="flex items-center gap-2 text-[11px] text-[color:var(--fg-subtle)] numerics">
          <span>{lineCount} linhas</span>
          <span>·</span>
          <span>{charCount} chars</span>
        </div>
        <button
          type="button"
          onClick={() => setWrap((s) => !s)}
          aria-label="Alternar quebra de linha"
          title={wrap ? "Desativar quebra de linha" : "Ativar quebra de linha"}
          className="inline-flex items-center gap-1.5 text-[10px] px-1.5 py-0.5 rounded transition-colors"
          style={{
            backgroundColor: "transparent",
            color: wrap ? "var(--mint-300)" : "var(--fg-subtle)",
            border: "1px solid var(--b-soft)",
            lineHeight: 1,
          }}
        >
          <span>quebrar</span>
          <span
            aria-hidden
            style={{
              position: "relative",
              display: "inline-block",
              width: 18,
              height: 10,
              borderRadius: 5,
              backgroundColor: wrap
                ? "var(--mint-700)"
                : "rgba(255,255,255,0.10)",
              border: `1px solid ${
                wrap ? "var(--mint-600)" : "rgba(255,255,255,0.18)"
              }`,
              transition: "background-color 160ms ease",
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 1,
                left: wrap ? 9 : 1,
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: wrap
                  ? "var(--mint-100)"
                  : "rgba(255,255,255,0.65)",
                transition: "left 160ms ease",
              }}
            />
          </span>
        </button>
      </div>

      {err && (
        <div
          className="mx-5 px-3 py-2 text-[12px] rounded"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            border: "1px solid var(--amber-border)",
          }}
        >
          {err}
        </div>
      )}

      <div className="p-5 flex flex-col" style={{ minHeight: "60vh" }}>
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleTab}
          disabled={pending || !canEdit}
          spellCheck={false}
          wrap={wrap ? "soft" : "off"}
          placeholder="identidade_agente: |&#10;  - Você é um SDR..."
          className="flex-1 text-[13px] px-3 py-2 rounded-md w-full"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
            color: "var(--fg)",
            outline: "none",
            resize: "none",
            fontFamily:
              "var(--font-geist-mono), ui-monospace, monospace",
            lineHeight: "1.7",
            tabSize: 2,
            whiteSpace: wrap ? "pre-wrap" : "pre",
            wordBreak: wrap ? "break-word" : "normal",
            overflow: "auto",
            minHeight: "55vh",
          }}
        />
      </div>
    </ModalShell>
  );
}

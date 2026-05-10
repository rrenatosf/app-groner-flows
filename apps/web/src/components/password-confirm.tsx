"use client";

import { useEffect, useRef, useState } from "react";
import { ModalShell } from "./modal-shell";

/** Prompt minimal pedindo a senha do super atual.
 *  Usado pra gates de privilege escalation (ex: ativar isSuperadmin). */
export function PasswordConfirm({
  open,
  title = "Confirmação necessária",
  message,
  pending,
  errorMessage,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title?: string;
  message: string;
  pending?: boolean;
  errorMessage?: string | null;
  onConfirm: (password: string) => void;
  onCancel: () => void;
}) {
  const [password, setPassword] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setPassword("");
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    onConfirm(password);
  }

  return (
    <ModalShell
      open={open}
      onClose={onCancel}
      eyebrow="Privilégio"
      title={title}
      size="sm"
      zIndex={60}
      isDirty={false}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
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
            disabled={pending || !password}
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{ opacity: !password ? 0.5 : 1 }}
          >
            {pending ? "Validando…" : "Confirmar"}
          </button>
        </>
      }
    >
      <form id="modal-form" ref={formRef} onSubmit={submit}>
        <div className="p-5 space-y-3">
          <p className="text-[12.5px] text-[color:var(--fg-muted)] leading-relaxed">
            {message}
          </p>
          <input
            ref={inputRef}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={pending}
            placeholder="Senha do superadmin atual"
            className="w-full text-[13px] px-2.5 py-1.5 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              border: "1px solid var(--b-soft)",
              color: "var(--fg)",
              outline: "none",
            }}
          />
          {errorMessage && (
            <div
              className="text-[11.5px] px-2 py-1.5 rounded"
              style={{
                backgroundColor: "var(--rose-bg)",
                color: "var(--rose-300)",
                border: "1px solid var(--rose-border)",
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>
      </form>
    </ModalShell>
  );
}

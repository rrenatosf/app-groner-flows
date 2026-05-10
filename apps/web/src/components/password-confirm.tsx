"use client";

import { useEffect, useRef, useState } from "react";

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

  useEffect(() => {
    if (open) {
      setPassword("");
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    onConfirm(password);
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      style={{
        backgroundColor: "rgba(2,8,5,0.62)",
        backdropFilter: "blur(2px)",
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-[420px] rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        <div
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div className="label-eyebrow">Privilégio</div>
          <h2 className="serif text-[18px] leading-tight text-[color:var(--fg)]">
            {title}
          </h2>
        </div>

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

        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
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
            disabled={pending || !password}
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{ opacity: !password ? 0.5 : 1 }}
          >
            {pending ? "Validando…" : "Confirmar"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export type ModalSize = "sm" | "md" | "lg" | "full";

const SIZE_STYLES: Record<ModalSize, { width: string; height: string }> = {
  sm: { width: "max-w-[640px]", height: "max-h-[80vh]" },
  md: { width: "max-w-[920px]", height: "max-h-[90vh]" },
  lg: { width: "max-w-[1200px]", height: "max-h-[90vh]" },
  full: { width: "max-w-[90vw]", height: "max-h-[90vh]" },
};

export function ModalShell({
  open,
  onClose,
  title,
  eyebrow,
  isDirty = false,
  confirmCloseIfDirty = true,
  size = "full",
  zIndex = 50,
  onSubmit,
  children,
  footer,
  ariaLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  eyebrow?: string;
  isDirty?: boolean;
  confirmCloseIfDirty?: boolean;
  size?: ModalSize;
  zIndex?: number;
  /** Quando presente, Cmd/Ctrl+S dispara `onSubmit`. */
  onSubmit?: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  ariaLabel?: string;
}) {
  const dirtyRef = useRef(isDirty);
  dirtyRef.current = isDirty;

  // Helper: tenta fechar respeitando confirm dirty
  const tryClose = () => {
    if (
      confirmCloseIfDirty &&
      dirtyRef.current &&
      !window.confirm(
        "Sair sem salvar? Suas alterações serão perdidas.",
      )
    ) {
      return;
    }
    onClose();
  };

  // ESC + Cmd/Ctrl+S handlers
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        tryClose();
        return;
      }
      if ((e.key === "s" || e.key === "S") && (e.metaKey || e.ctrlKey)) {
        if (onSubmit) {
          e.preventDefault();
          onSubmit();
        }
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onSubmit, confirmCloseIfDirty]);

  // Lock scroll body quando aberto
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // SSR guard: createPortal precisa de document. Espera mount no client.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!open || !mounted) return null;

  const sizeStyle = SIZE_STYLES[size];

  // Portal pra body: evita HTML inválido (modal renderizado dentro de
  // <form> pai virava <form> aninhado, ex: PasswordConfirm dentro de
  // cliente-dados-form). Portal escapa da árvore React mas mantém
  // contexto/state.
  return createPortal(
    <div
      className="fixed inset-0 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel ?? title}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) tryClose();
      }}
      style={{
        // `position: fixed` inline força — alguma rule do globals.css
        // sobrescreve a classe `.fixed` do Tailwind quando portal cai
        // em body com `display: flex`, jogando o modal fora da viewport.
        position: "fixed",
        backgroundColor: "rgba(2,8,5,0.62)",
        backdropFilter: "blur(2px)",
        zIndex,
      }}
    >
      <div
        className={`w-full ${sizeStyle.width} ${sizeStyle.height} rounded-xl flex flex-col`}
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        {/* Header */}
        <div
          className="px-5 py-4 flex items-start justify-between gap-3 shrink-0"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div className="min-w-0 flex-1">
            {eyebrow && <div className="label-eyebrow">{eyebrow}</div>}
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)] truncate">
              {title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {isDirty && (
              <span
                className="text-[10.5px] uppercase tracking-wider px-2 py-1 rounded-full"
                style={{
                  backgroundColor: "var(--amber-bg)",
                  color: "var(--amber-300)",
                  border: "1px solid var(--amber-border)",
                }}
                title="Você tem alterações não salvas"
              >
                ● Alterações pendentes
              </span>
            )}
            <button
              type="button"
              onClick={tryClose}
              aria-label="Fechar"
              className="text-[16px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Body (scroll) */}
        <div className="flex-1 overflow-y-auto">{children}</div>

        {/* Footer (opcional, sticky) */}
        {footer && (
          <div
            className="px-5 py-3 flex items-center justify-end gap-2 shrink-0"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

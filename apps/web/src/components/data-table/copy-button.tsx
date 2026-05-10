"use client";

import { useState } from "react";
import { IconCheck, IconCopy } from "./icons";

/** Copia texto para o clipboard. Tenta navigator.clipboard; cai pro
 *  textarea hack se a API não estiver disponível (HTTPS bloqueado, etc). */
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    /* fallback */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Botão genérico de copiar. Mostra check mint por 1.2s após cópia. */
export function CopyButton({
  value,
  size = 15,
  className,
}: {
  value: string;
  size?: number;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy(e: React.MouseEvent) {
    e.stopPropagation();
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copiar"
      title={copied ? "Copiado" : "Copiar"}
      className={
        className ??
        "inline-flex items-center transition-colors hover:text-[color:var(--mint-300)]"
      }
      style={{ color: copied ? "var(--mint-300)" : "var(--fg-muted)" }}
    >
      {copied ? <IconCheck size={size} /> : <IconCopy size={size} />}
    </button>
  );
}

"use client";

import { useState } from "react";
import { copyToClipboard } from "./copy-button";
import { IconCheck, IconCopy, IconEye, IconEyeOff } from "./icons";

/** Input de texto com toggle de password + botão copy. Default mostra
 *  como password. Toggle vira text. Copy usa valor real mesmo oculto.
 *  Usado em formulários de credenciais/tokens. */
export function SecretInput({
  value,
  onChange,
  disabled,
  highlight,
  forcePassword,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Border destacada (ex: campo pendente). */
  highlight?: boolean;
  /** Se true, eye desabilitado quando vazio (ex: senha sem valor inicial). */
  forcePassword?: boolean;
  placeholder?: string;
}) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  }

  return (
    <div
      className="flex items-center gap-1 rounded-md px-1.5"
      style={{
        backgroundColor: "var(--ink-3)",
        border: highlight
          ? "1.5px solid var(--rose-border)"
          : "1px solid var(--b-soft)",
      }}
    >
      <button
        type="button"
        onClick={() => setRevealed((s) => !s)}
        disabled={disabled || (forcePassword && !value)}
        aria-label={revealed ? "Ocultar" : "Ver"}
        title={revealed ? "Ocultar" : "Ver"}
        className="inline-flex items-center transition-colors hover:text-[color:var(--mint-300)] px-0.5"
        style={{
          color: revealed ? "var(--mint-300)" : "var(--fg-muted)",
        }}
      >
        {revealed ? <IconEye size={16} /> : <IconEyeOff size={16} />}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        disabled={disabled || !value}
        aria-label="Copiar"
        title={copied ? "Copiado" : "Copiar"}
        className="inline-flex items-center transition-colors hover:text-[color:var(--mint-300)] px-0.5"
        style={{
          color: copied
            ? "var(--mint-300)"
            : value
              ? "var(--fg-muted)"
              : "var(--fg-disabled)",
          opacity: value ? 1 : 0.5,
        }}
      >
        {copied ? <IconCheck size={15} /> : <IconCopy size={15} />}
      </button>
      <input
        type={revealed ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="flex-1 text-[13px] py-1.5 bg-transparent"
        style={{
          color: "var(--fg)",
          outline: "none",
          border: "none",
        }}
      />
    </div>
  );
}

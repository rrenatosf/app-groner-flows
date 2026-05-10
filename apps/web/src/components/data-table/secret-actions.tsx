"use client";

import { CopyButton } from "./copy-button";
import { IconEye, IconEyeOff } from "./icons";

/** Combo eye + copy. Eye toggla revelar/ocultar via callback externo;
 *  copy usa o valor real (mesmo mascarado). */
export function SecretActions({
  revealed,
  value,
  onToggle,
  iconSize = 16,
  copySize = 15,
}: {
  revealed: boolean;
  value: string;
  onToggle: () => void;
  iconSize?: number;
  copySize?: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        aria-label={revealed ? "Ocultar" : "Ver"}
        title={revealed ? "Ocultar" : "Ver"}
        className="inline-flex items-center transition-colors hover:text-[color:var(--mint-300)]"
        style={{
          color: revealed ? "var(--mint-300)" : "var(--fg-muted)",
        }}
      >
        {revealed ? (
          <IconEye size={iconSize} />
        ) : (
          <IconEyeOff size={iconSize} />
        )}
      </button>
      <CopyButton value={value} size={copySize} />
    </span>
  );
}

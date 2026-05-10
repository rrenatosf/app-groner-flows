"use client";

import { useState } from "react";

export function PasswordField({
  label,
  name,
  defaultValue,
  hint,
  placeholder,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  hint?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <label className="block">
      <span className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[12.5px] font-medium text-[color:var(--fg-muted)]">
          {label}
        </span>
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="size-6 rounded-md flex items-center justify-center text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] text-[14px] leading-none"
          aria-label={show ? "Ocultar" : "Mostrar"}
          tabIndex={-1}
        >
          {show ? "🙈" : "👁"}
        </button>
      </span>
      <input
        type={show ? "text" : "password"}
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="input numerics font-mono text-[12.5px]"
      />
      {hint && (
        <span className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5 block leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}

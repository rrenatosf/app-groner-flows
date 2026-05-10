"use client";

import { MAX_ARRAY_LEN, MAX_STRING_LEN } from "../dados-config-shape";
import { TelefoneBRInput } from "./TelefoneBRInput";

/** Editor de array primitivo (string ou number). Limite de tamanho =
 *  MAX_ARRAY_LEN. Cada item é input simples. Quando `telefoneBR=true`,
 *  cada item vira um TelefoneBRInput (formato E.164 BR). */
export function ArrayInput({
  value,
  onChange,
  type,
  telefoneBR,
  disabled,
}: {
  value: (string | number)[];
  onChange: (next: (string | number)[]) => void;
  type: "string" | "number";
  /** Quando true, renderiza cada item como TelefoneBRInput (só pra
   *  array-string). Ignorado pra array-number. */
  telefoneBR?: boolean;
  disabled?: boolean;
}) {
  const items = Array.isArray(value) ? value : [];

  function update(idx: number, v: string) {
    const next = [...items];
    if (type === "number") {
      next[idx] = v === "" ? 0 : Number(v);
    } else {
      next[idx] = v.length > MAX_STRING_LEN ? v.slice(0, MAX_STRING_LEN) : v;
    }
    onChange(next);
  }
  function add() {
    if (items.length >= MAX_ARRAY_LEN) return;
    onChange([...items, type === "number" ? 0 : ""]);
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.length === 0 && (
        <p className="text-[11px] text-[color:var(--fg-subtle)]">
          {telefoneBR && type === "string"
            ? '(vazio — clique em "+ Adicionar" pra incluir um telefone)'
            : '(vazio — clique em "+ Adicionar" pra incluir)'}
        </p>
      )}
      {items.map((v, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
          {telefoneBR && type === "string" ? (
            <div className="flex-1">
              <TelefoneBRInput
                value={typeof v === "string" ? v : ""}
                onChange={(stored) => update(idx, stored)}
                disabled={disabled}
              />
            </div>
          ) : (
            <input
              type={type === "number" ? "number" : "text"}
              value={v === null || v === undefined ? "" : String(v)}
              onChange={(e) => update(idx, e.target.value)}
              disabled={disabled}
              maxLength={type === "string" ? MAX_STRING_LEN : undefined}
              className="flex-1 text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          )}
          <button
            type="button"
            onClick={() => remove(idx)}
            disabled={disabled}
            aria-label={`Remover item ${idx + 1}`}
            className="text-[12px] px-2 py-1 rounded-md disabled:opacity-50"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--rose-300)",
              border: "1px solid var(--b-soft)",
            }}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        disabled={disabled || items.length >= MAX_ARRAY_LEN}
        className="self-start text-[11px] px-2 py-1 rounded-md disabled:opacity-50"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--mint-300)",
          border: "1px dashed var(--b-base)",
        }}
        title={
          items.length >= MAX_ARRAY_LEN
            ? `Máximo ${MAX_ARRAY_LEN} itens`
            : undefined
        }
      >
        + Adicionar
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { MAX_ARRAY_LEN, MAX_STRING_LEN } from "../dados-config-shape";
import {
  TELEFONE_BR_STORED_LEN,
  fromTelefoneStored,
} from "../dados-config-form";
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

  // Modo telefoneBR usa layout diferenciado: input compositor com botão
  // "+ Adicionar" à direita, lista de telefones cadastrados abaixo, valida
  // duplicata. Os outros casos (string/number genérico) mantêm cada item
  // como input editável inline.
  if (telefoneBR && type === "string") {
    return (
      <TelefoneArrayInput
        value={items.filter((v): v is string => typeof v === "string")}
        onChange={(next) => onChange(next)}
        disabled={disabled}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      {items.length === 0 && (
        <p className="text-[11px] text-[color:var(--fg-subtle)]">
          (vazio — clique em &quot;+ Adicionar&quot; pra incluir)
        </p>
      )}
      {items.map((v, idx) => (
        <div key={idx} className="flex items-center gap-1.5">
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

/** Compositor de array de telefones BR: input vazio em cima + botão
 *  "+ Adicionar" à direita; lista de já cadastrados abaixo (formato bonito
 *  + botão remover). Valida formato (10 dígitos) e duplicata antes de
 *  adicionar. */
function TelefoneArrayInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [pending, setPending] = useState("");
  const [err, setErr] = useState<string | null>(null);

  // Sanitiza entries fantasma (string vazia ou só whitespace) que vinham
  // do template `["": vazio]` e apareciam como "+55" sem número na lista.
  // Auto-corrige na carga inicial — não exige user clicar pra deletar.
  useEffect(() => {
    const cleaned = value.filter(
      (v) => typeof v === "string" && v.trim() !== "",
    );
    if (cleaned.length !== value.length) {
      onChange(cleaned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function tryAdd() {
    setErr(null);
    if (!pending) return;
    if (pending.length !== TELEFONE_BR_STORED_LEN) {
      setErr("Telefone incompleto. Preencha DDD + 8 ou 9 dígitos.");
      return;
    }
    if (value.includes(pending)) {
      setErr(`Telefone ${formatDisplay(pending)} já está cadastrado.`);
      return;
    }
    if (value.length >= MAX_ARRAY_LEN) {
      setErr(`Máximo ${MAX_ARRAY_LEN} telefones por campo.`);
      return;
    }
    onChange([...value, pending]);
    setPending("");
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function formatDisplay(stored: string): string {
    const d = fromTelefoneStored(stored);
    if (d.length !== 11) return stored;
    const ddd = d.slice(0, 2);
    const noveOrFirst = d.slice(2, 3);
    const rest = d.slice(3);
    return `(${ddd}) ${noveOrFirst} ${rest.slice(0, 4)}-${rest.slice(4)}`;
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Linha de cadastro: input + botão à direita */}
      <div className="flex items-start gap-1.5">
        <div className="flex-1">
          <TelefoneBRInput
            value={pending}
            onChange={(stored) => {
              setPending(stored);
              if (err) setErr(null);
            }}
            disabled={disabled || value.length >= MAX_ARRAY_LEN}
          />
        </div>
        <button
          type="button"
          onClick={tryAdd}
          disabled={disabled || value.length >= MAX_ARRAY_LEN}
          className="text-[12px] px-3 py-1.5 rounded-md whitespace-nowrap disabled:opacity-50"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--mint-300)",
            border: "1px solid var(--b-base)",
            height: "33px",
          }}
          title={
            value.length >= MAX_ARRAY_LEN
              ? `Máximo ${MAX_ARRAY_LEN} telefones`
              : "Adicionar telefone"
          }
        >
          + Adicionar
        </button>
      </div>

      {err && (
        <p
          className="text-[11px] px-2 py-1 rounded"
          style={{
            backgroundColor: "var(--rose-bg)",
            color: "var(--rose-300)",
            border: "1px solid var(--rose-border)",
          }}
        >
          {err}
        </p>
      )}

      {/* Lista de telefones cadastrados */}
      {value.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {value.map((stored, idx) => (
            <li
              key={`${stored}-${idx}`}
              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-2)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <span className="text-[13px] numerics" style={{ color: "var(--fg)" }}>
                +55 {formatDisplay(stored)}
              </span>
              <button
                type="button"
                onClick={() => remove(idx)}
                disabled={disabled}
                aria-label={`Remover telefone ${formatDisplay(stored)}`}
                className="text-[12px] px-2 py-0.5 rounded-md disabled:opacity-50"
                style={{
                  backgroundColor: "var(--ink-3)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--b-soft)",
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-[color:var(--fg-subtle)]">
          Nenhum telefone cadastrado.
        </p>
      )}

      {value.length > 0 && (
        <p className="text-[10.5px] text-[color:var(--fg-subtle)]">
          {value.length} de {MAX_ARRAY_LEN} telefones cadastrados.
        </p>
      )}
    </div>
  );
}

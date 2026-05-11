"use client";

import { BooleanToggle } from "@/components/data-table";
import {
  type FieldKind,
  humanizeKey,
  isAutofillField,
  isCrmStatusObject,
  isSecretField,
  isTelefoneField,
} from "../dados-config-form";
import { MAX_STRING_LEN } from "../dados-config-shape";
import { ArrayInput } from "./ArrayInput";
import { CrmStatusPickerButton } from "./CrmStatusPickerButton";
import { GroupFields } from "./GroupFields";
import { TelefoneBRInput } from "./TelefoneBRInput";

/** Renderiza UM campo conforme o kind inferido. Boolean usa BooleanToggle
 *  do design system. Object renderiza recursivamente via GroupFields
 *  (sub-grupos, sub-pickers de coluna, qualquer profundidade). */
export function FieldInput({
  fieldKey,
  kind,
  value,
  onChange,
  disabled,
}: {
  fieldKey: string;
  kind: FieldKind;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  // Objeto aninhado: card com header (título + divisor) e GroupFields
  // recursivo abaixo. Se shape bater com CRM status (`crm_status_id` +
  // `crm_etapa_id`), header ganha botão "Buscar do CRM" à direita.
  if (kind.kind === "object") {
    const inner =
      value !== null && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
    const hasCrmStatus = isCrmStatusObject(inner);
    return (
      <div
        className="rounded-md"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <div
          className="flex items-center justify-between gap-2 px-3 py-2"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <span
            className="text-[12.5px] font-medium truncate"
            style={{ color: "var(--fg)" }}
            title={fieldKey}
          >
            {fieldKey}
          </span>
          {hasCrmStatus && (
            <CrmStatusPickerButton
              inner={inner}
              onChange={(next) => onChange(next)}
              disabled={disabled}
            />
          )}
        </div>
        <div className="px-3 py-2.5">
          <GroupFields
            groupName={fieldKey}
            groupValue={inner}
            onChange={(next) => onChange(next)}
            disabled={disabled}
          />
        </div>
      </div>
    );
  }

  const label = humanizeKey(fieldKey);
  const auto = isAutofillField(fieldKey);
  const secret = isSecretField(fieldKey);

  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)] flex items-center flex-wrap gap-x-1">
        <span>{label}</span>
        <span
          className="normal-case text-[10px]"
          style={{ color: "var(--fg-subtle)", letterSpacing: 0 }}
        >
          ({fieldKey})
        </span>
        {auto && (
          <span
            className="ml-1.5 px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wider"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--mint-300)",
              border: "1px solid var(--b-soft)",
            }}
            title="Preenchido automaticamente pelo sistema"
          >
            auto
          </span>
        )}
      </span>
      {renderInput(fieldKey, kind, value, onChange, disabled, auto, secret)}
    </label>
  );
}

function renderInput(
  fieldKey: string,
  kind: FieldKind,
  value: unknown,
  onChange: (next: unknown) => void,
  disabled?: boolean,
  auto?: boolean,
  secret?: boolean,
) {
  const isTelefone = isTelefoneField(fieldKey);

  if (kind.kind === "string") {
    const s = typeof value === "string" ? value : "";
    if (isTelefone) {
      return (
        <TelefoneBRInput
          value={s}
          onChange={onChange as (next: string) => void}
          disabled={disabled}
        />
      );
    }
    const inputType = secret ? "password" : "text";
    const inputReadonly = !!(auto || secret);
    return (
      <input
        type={inputType}
        value={s}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v.length > MAX_STRING_LEN ? v.slice(0, MAX_STRING_LEN) : v);
        }}
        disabled={disabled}
        readOnly={inputReadonly}
        maxLength={MAX_STRING_LEN}
        autoComplete={secret ? "new-password" : undefined}
        className="text-[13px] px-2.5 py-1.5 rounded-md"
        style={{
          backgroundColor: inputReadonly ? "var(--ink-2)" : "var(--ink-3)",
          border: "1px solid var(--b-soft)",
          color: inputReadonly ? "var(--fg-muted)" : "var(--fg)",
          outline: "none",
          cursor: inputReadonly ? "default" : undefined,
        }}
      />
    );
  }
  if (kind.kind === "number") {
    const n =
      typeof value === "number"
        ? value
        : typeof value === "string" && value !== ""
          ? Number(value)
          : "";
    return (
      <input
        type="number"
        value={n === "" || Number.isNaN(n as number) ? "" : String(n)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? 0 : Number(v));
        }}
        disabled={disabled}
        className="text-[13px] px-2.5 py-1.5 rounded-md"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
          color: "var(--fg)",
          outline: "none",
        }}
      />
    );
  }
  if (kind.kind === "boolean") {
    const b = typeof value === "boolean" ? value : false;
    return (
      <span className="inline-flex items-center gap-2">
        <BooleanToggle
          value={b}
          pending={disabled}
          ariaLabel="Valor"
          onClick={(e) => {
            e.preventDefault();
            if (disabled) return;
            onChange(!b);
          }}
        />
        <span className="text-[12px] text-[color:var(--fg-muted)]">
          {b ? "true" : "false"}
        </span>
      </span>
    );
  }
  if (kind.kind === "array-string" || kind.kind === "array-number") {
    const arr = Array.isArray(value) ? (value as (string | number)[]) : [];
    return (
      <ArrayInput
        value={arr}
        onChange={onChange as (next: (string | number)[]) => void}
        type={kind.kind === "array-number" ? "number" : "string"}
        telefoneBR={isTelefone && kind.kind === "array-string"}
        disabled={disabled}
      />
    );
  }
  if (kind.kind === "unsupported") {
    return (
      <div
        className="text-[11.5px] px-2.5 py-1.5 rounded-md"
        style={{
          backgroundColor: "var(--amber-bg)",
          color: "var(--amber-300)",
          border: "1px solid var(--amber-border)",
        }}
      >
        Tipo não suportado pelo form visual: {kind.reason} Use o editor JSON cru.
      </div>
    );
  }
  // object case já tratado acima — não chega aqui.
  return null;
}

"use client";

import {
  TELEFONE_BR_USER_LEN,
  digitsOnly,
  fromTelefoneStored,
  toTelefoneStored,
} from "../dados-config-form";

/** Input dedicado pra telefone BR formato E.164.
 *  - Prefixo `+55 9` fixo (não editável).
 *  - User digita só DDD(2) + 8 dígitos = 10 chars.
 *  - Storage interno = "55" + DDD + "9" + 8 = 13 chars.
 *  - Aceita só números, valida 10 dígitos. */
export function TelefoneBRInput({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (storage: string) => void;
  disabled?: boolean;
}) {
  const userInput = fromTelefoneStored(value ?? "");
  const isValid = userInput.length === TELEFONE_BR_USER_LEN;
  const showError = userInput.length > 0 && !isValid;
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="text-[12px] px-2 py-1.5 rounded-md select-none whitespace-nowrap"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
          color: "var(--fg-muted)",
        }}
      >
        +55 9
      </span>
      <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={userInput}
        onChange={(e) => {
          const d = digitsOnly(e.target.value).slice(0, TELEFONE_BR_USER_LEN);
          onChange(toTelefoneStored(d));
        }}
        placeholder="DDD + 8 dígitos"
        maxLength={TELEFONE_BR_USER_LEN}
        disabled={disabled}
        aria-invalid={showError}
        className="flex-1 numerics input-edit"
        style={
          showError
            ? {
                borderColor: "var(--rose-border)",
                borderWidth: "1.5px",
              }
            : undefined
        }
      />
      {showError && (
        <span
          className="text-[10.5px] numerics shrink-0"
          style={{ color: "var(--rose-300)" }}
          title={`Faltam ${TELEFONE_BR_USER_LEN - userInput.length} dígito(s)`}
        >
          {userInput.length}/{TELEFONE_BR_USER_LEN}
        </span>
      )}
    </div>
  );
}

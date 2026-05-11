"use client";

import {
  TELEFONE_BR_USER_LEN_MAX,
  TELEFONE_BR_USER_LEN_MIN,
  digitsOnly,
  fromTelefoneStored,
  toTelefoneStored,
} from "../dados-config-form";

/** Input dedicado pra telefone BR formato E.164.
 *  - Prefixo `+55` fixo (não editável). O `9` é injetado automaticamente
 *    no storage caso o user digite só DDD+8.
 *  - User pode digitar 10 (DDD+8) ou 11 (DDD+9+8) dígitos.
 *  - Storage interno = "55" + DDD + "9" + 8 = 13 chars. */
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
  // 10 dígitos só é válido pra fixo legado (3º dígito ≠ `9`). 10 dígitos
  // com `9` no 3º = móvel incompleto (falta o 11º) — marca como inválido
  // pra evitar salvar mid-typing.
  const isValid =
    (userInput.length === TELEFONE_BR_USER_LEN_MIN &&
      userInput.charAt(2) !== "9") ||
    userInput.length === TELEFONE_BR_USER_LEN_MAX;
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
        +55
      </span>
      <input
        type="tel"
        inputMode="numeric"
        pattern="[0-9]*"
        value={userInput}
        onChange={(e) => {
          const d = digitsOnly(e.target.value).slice(
            0,
            TELEFONE_BR_USER_LEN_MAX,
          );
          onChange(toTelefoneStored(d));
        }}
        placeholder="DDD + 8 ou 9 dígitos"
        maxLength={TELEFONE_BR_USER_LEN_MAX}
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
          title={`Mínimo ${TELEFONE_BR_USER_LEN_MIN} dígitos`}
        >
          {userInput.length}/{TELEFONE_BR_USER_LEN_MAX}
        </span>
      )}
    </div>
  );
}

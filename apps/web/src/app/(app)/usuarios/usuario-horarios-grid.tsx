"use client";

import {
  DIAS_SEMANA,
  type DiaSemana,
  type HorariosVendedor,
  type IntervaloHorario,
} from "@/lib/db/schema";
import {
  PRESET_COMERCIAL_8_18,
  PRESET_COMERCIAL_8_19_SAB,
} from "@/lib/horarios";

/** Grid de horários por dia da semana — controlled.
 *  Pai passa `value` (HorariosVendedor) e `onChange`; este componente
 *  só renderiza e propaga mudanças. Suporta presets e múltiplos
 *  intervalos por dia. Usado dentro do modal de edição de usuário. */
export function UsuarioHorariosGrid({
  value,
  onChange,
  disabled,
}: {
  value: HorariosVendedor;
  onChange: (next: HorariosVendedor) => void;
  disabled?: boolean;
}) {
  function getDia(d: DiaSemana): IntervaloHorario[] {
    const arr = value[d];
    return Array.isArray(arr) ? arr : [];
  }

  function setDia(d: DiaSemana, next: IntervaloHorario[]) {
    const out: HorariosVendedor = { ...value };
    if (next.length === 0) {
      delete out[d];
    } else {
      out[d] = next;
    }
    onChange(out);
  }

  function addIntervalo(d: DiaSemana) {
    setDia(d, [...getDia(d), { inicio: "08:00", fim: "12:00" }]);
  }
  function removeIntervalo(d: DiaSemana, idx: number) {
    setDia(
      d,
      getDia(d).filter((_, i) => i !== idx),
    );
  }
  function updateIntervalo(
    d: DiaSemana,
    idx: number,
    campo: "inicio" | "fim",
    valor: string,
  ) {
    setDia(
      d,
      getDia(d).map((iv, i) =>
        i === idx ? { ...iv, [campo]: valor } : iv,
      ),
    );
  }

  function aplicarPreset(p: HorariosVendedor) {
    const out: HorariosVendedor = {};
    for (const d of DIAS_SEMANA) {
      const arr = p[d.key];
      if (Array.isArray(arr) && arr.length > 0) {
        out[d.key] = arr.map((iv) => ({ ...iv }));
      }
    }
    onChange(out);
  }
  function limparTudo() {
    onChange({});
  }

  const totalIntervalos = DIAS_SEMANA.reduce(
    (sum, d) => sum + getDia(d.key).length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[12px] text-[color:var(--fg-muted)]">
          {totalIntervalos} intervalo{totalIntervalos === 1 ? "" : "s"}{" "}
          cadastrado{totalIntervalos === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => aplicarPreset(PRESET_COMERCIAL_8_18)}
            disabled={disabled}
            className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            title="Seg–sex 08:00–12:00 e 13:00–18:00"
          >
            comercial 8–18
          </button>
          <span className="text-[10px] text-[color:var(--fg-disabled)]">
            ·
          </span>
          <button
            type="button"
            onClick={() => aplicarPreset(PRESET_COMERCIAL_8_19_SAB)}
            disabled={disabled}
            className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            title="Seg–sex 08:00–12:00 e 13:00–19:00 + sáb 08:00–12:00"
          >
            comercial 8–19 + sáb
          </button>
          <span className="text-[10px] text-[color:var(--fg-disabled)]">
            ·
          </span>
          <button
            type="button"
            onClick={limparTudo}
            disabled={disabled}
            className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[color:var(--rose-300)]"
          >
            limpar tudo
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-md"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <ul>
          {DIAS_SEMANA.map((d, i) => {
            const intervalos = getDia(d.key);
            return (
              <li
                key={d.key}
                className="px-3 py-2.5"
                style={{
                  borderBottom:
                    i < DIAS_SEMANA.length - 1
                      ? "1px solid var(--b-soft)"
                      : "none",
                }}
              >
                <div className="flex items-start gap-3">
                  <span className="text-[12.5px] font-medium text-[color:var(--fg)] w-20 shrink-0 pt-1">
                    {d.label}
                  </span>
                  <div className="flex-1 flex flex-wrap items-center gap-2">
                    {intervalos.length === 0 && (
                      <span className="text-[11.5px] text-[color:var(--fg-subtle)] italic py-1">
                        sem atendimento
                      </span>
                    )}
                    {intervalos.map((iv, idx) => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5"
                        style={{
                          backgroundColor: "var(--ink-2)",
                          border: "1px solid var(--b-soft)",
                        }}
                      >
                        <input
                          type="time"
                          value={iv.inicio}
                          onChange={(e) =>
                            updateIntervalo(
                              d.key,
                              idx,
                              "inicio",
                              e.target.value,
                            )
                          }
                          disabled={disabled}
                          className="bg-transparent text-[12px] text-[color:var(--fg)] focus:outline-none numerics"
                          style={{ width: "70px" }}
                        />
                        <span className="text-[10.5px] text-[color:var(--fg-subtle)]">
                          –
                        </span>
                        <input
                          type="time"
                          value={iv.fim}
                          onChange={(e) =>
                            updateIntervalo(
                              d.key,
                              idx,
                              "fim",
                              e.target.value,
                            )
                          }
                          disabled={disabled}
                          className="bg-transparent text-[12px] text-[color:var(--fg)] focus:outline-none numerics"
                          style={{ width: "70px" }}
                        />
                        <button
                          type="button"
                          onClick={() => removeIntervalo(d.key, idx)}
                          disabled={disabled}
                          className="text-[10.5px] px-1 text-[color:var(--fg-subtle)] hover:text-[color:var(--rose-300)]"
                          title="Remover intervalo"
                          aria-label="Remover intervalo"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => addIntervalo(d.key)}
                      disabled={disabled}
                      className="text-[11px] px-2 py-0.5 rounded-md text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                      style={{
                        backgroundColor: "var(--ink-3)",
                        border: "1px dashed var(--b-soft)",
                      }}
                    >
                      + intervalo
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="text-[11px] text-[color:var(--fg-subtle)]">
        Use os presets acima pra aplicar configurações comuns. Cada
        intervalo pode ser editado, adicionado ou removido individualmente.
        Dia sem intervalos = sem atendimento naquele dia.
      </p>
    </div>
  );
}

"use client";

import { useState } from "react";
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

type Estado = Record<DiaSemana, IntervaloHorario[]>;

function buildEstadoInicial(initial: HorariosVendedor): Estado {
  const out = {} as Estado;
  for (const d of DIAS_SEMANA) {
    const arr = initial[d.key];
    out[d.key] = Array.isArray(arr) ? arr.map((i) => ({ ...i })) : [];
  }
  return out;
}

function fromPreset(p: HorariosVendedor): Estado {
  const out = {} as Estado;
  for (const d of DIAS_SEMANA) {
    const arr = p[d.key];
    out[d.key] = Array.isArray(arr) ? arr.map((i) => ({ ...i })) : [];
  }
  return out;
}

export function HorariosGrid({
  initial,
}: {
  initial: HorariosVendedor;
}) {
  const [estado, setEstado] = useState<Estado>(() =>
    buildEstadoInicial(initial),
  );

  function addIntervalo(dia: DiaSemana) {
    setEstado((prev) => ({
      ...prev,
      [dia]: [...prev[dia], { inicio: "08:00", fim: "12:00" }],
    }));
  }

  function removeIntervalo(dia: DiaSemana, idx: number) {
    setEstado((prev) => ({
      ...prev,
      [dia]: prev[dia].filter((_, i) => i !== idx),
    }));
  }

  function updateIntervalo(
    dia: DiaSemana,
    idx: number,
    campo: "inicio" | "fim",
    valor: string,
  ) {
    setEstado((prev) => ({
      ...prev,
      [dia]: prev[dia].map((i, k) =>
        k === idx ? { ...i, [campo]: valor } : i,
      ),
    }));
  }

  function aplicarPreset(p: HorariosVendedor) {
    setEstado(fromPreset(p));
  }

  function limparTudo() {
    setEstado(buildEstadoInicial({}));
  }

  const totalIntervalos = DIAS_SEMANA.reduce(
    (sum, d) => sum + estado[d.key].length,
    0,
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-[12px] text-[color:var(--fg-muted)]">
          {totalIntervalos} intervalo{totalIntervalos === 1 ? "" : "s"} cadastrado
          {totalIntervalos === 1 ? "" : "s"}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            type="button"
            onClick={() => aplicarPreset(PRESET_COMERCIAL_8_18)}
            className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            title="Seg–sex 08:00–12:00 e 13:00–18:00"
          >
            comercial 8–18
          </button>
          <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
          <button
            type="button"
            onClick={() => aplicarPreset(PRESET_COMERCIAL_8_19_SAB)}
            className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            title="Seg–sex 08:00–12:00 e 13:00–19:00 + sáb 08:00–12:00"
          >
            comercial 8–19 + sáb
          </button>
          <span className="text-[10px] text-[color:var(--fg-disabled)]">·</span>
          <button
            type="button"
            onClick={limparTudo}
            className="text-[10.5px] px-2 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
          >
            limpar
          </button>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-md"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <ul>
          {DIAS_SEMANA.map((d, i) => {
            const intervalos = estado[d.key];
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
                  <span
                    className="text-[12.5px] font-medium text-[color:var(--fg)] w-20 shrink-0 pt-1"
                  >
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
                        className="inline-flex items-center gap-1 rounded-md px-1 py-0.5"
                        style={{
                          backgroundColor: "var(--ink-3)",
                          border: "1px solid var(--b-soft)",
                        }}
                      >
                        <input
                          type="time"
                          name={`horario_${d.key}_${idx}_inicio`}
                          value={iv.inicio}
                          onChange={(e) =>
                            updateIntervalo(
                              d.key,
                              idx,
                              "inicio",
                              e.target.value,
                            )
                          }
                          className="bg-transparent text-[12px] text-[color:var(--fg)] focus:outline-none numerics"
                          style={{ width: "70px" }}
                        />
                        <span className="text-[10.5px] text-[color:var(--fg-subtle)]">
                          –
                        </span>
                        <input
                          type="time"
                          name={`horario_${d.key}_${idx}_fim`}
                          value={iv.fim}
                          onChange={(e) =>
                            updateIntervalo(d.key, idx, "fim", e.target.value)
                          }
                          className="bg-transparent text-[12px] text-[color:var(--fg)] focus:outline-none numerics"
                          style={{ width: "70px" }}
                        />
                        <button
                          type="button"
                          onClick={() => removeIntervalo(d.key, idx)}
                          className="text-[10.5px] px-1 text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
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
                      className="text-[11px] px-2 py-0.5 rounded-md text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
                      style={{
                        backgroundColor: "rgba(70,200,154,0.06)",
                        border: "1px dashed rgba(70,200,154,0.32)",
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
    </div>
  );
}

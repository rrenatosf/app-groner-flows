"use client";

import { useEffect, useState } from "react";
import type { Loja } from "@/lib/db/schema";
import {
  addLojaAction,
  removeLojaAction,
  updateLojaAction,
} from "./actions";

const RESERVED = new Set([
  "nome",
  "crm_id",
  "area_atuacao",
  "consumo_minimo",
]);

function extrasOf(loja: Loja): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(loja)) {
    if (!RESERVED.has(k)) out[k] = v;
  }
  return out;
}

type Mode =
  | { kind: "list" }
  | { kind: "view"; index: number }
  | { kind: "edit"; index: number }
  | { kind: "add" };

export function LojasSection({
  lojas,
  isSuperadmin,
}: {
  lojas: Loja[];
  isSuperadmin: boolean;
}) {
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  return (
    <fieldset
      className="rounded-md p-4"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-base)",
      }}
    >
      <legend className="text-[12.5px] font-medium text-[color:var(--fg-muted)] px-2">
        Lojas
      </legend>

      <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1 mb-4">
        Cadastre as unidades físicas da empresa. Click em uma linha para ver
        detalhes.
        {isSuperadmin && (
          <span className="block mt-1 text-[color:var(--mint-300)]">
            Modo superadmin: você pode adicionar campos extras (chave + valor)
            em cada loja.
          </span>
        )}
      </p>

      {mode.kind === "add" && (
        <div className="mb-4">
          <LojaForm
            action={addLojaAction}
            isSuperadmin={isSuperadmin}
            onCancel={() => setMode({ kind: "list" })}
            submitLabel="Adicionar loja"
          />
        </div>
      )}

      {mode.kind === "edit" && (
        <div className="mb-4">
          <LojaForm
            action={updateLojaAction}
            initial={lojas[mode.index]}
            index={mode.index}
            isSuperadmin={isSuperadmin}
            onCancel={() => setMode({ kind: "list" })}
            submitLabel="Salvar alterações"
          />
        </div>
      )}

      {lojas.length === 0 ? (
        <p className="text-[13px] text-[color:var(--fg-subtle)]">
          Nenhuma loja cadastrada ainda.
        </p>
      ) : (
        <div
          className="overflow-hidden rounded-xl"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-soft)",
          }}
        >
          <table className="table-editorial">
            <thead>
              <tr>
                <th>Nome</th>
                <th>CRM ID</th>
                <th className="text-right">Área (km)</th>
                <th className="text-right">Consumo mín.</th>
                <th className="text-right">Extras</th>
              </tr>
            </thead>
            <tbody>
              {lojas.map((loja, i) => {
                const extras = extrasOf(loja);
                return (
                  <tr
                    key={i}
                    onClick={() => setMode({ kind: "view", index: i })}
                    className="cursor-pointer"
                  >
                    <td className="font-medium">{loja.nome}</td>
                    <td className="numerics text-[color:var(--fg-muted)]">
                      {loja.crm_id || "—"}
                    </td>
                    <td className="text-right numerics">
                      {loja.area_atuacao}
                    </td>
                    <td className="text-right numerics">
                      {loja.consumo_minimo}
                    </td>
                    <td className="text-right text-[11px] text-[color:var(--fg-subtle)]">
                      {Object.keys(extras).length > 0
                        ? `${Object.keys(extras).length} campo(s)`
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {mode.kind === "list" && (
        <button
          type="button"
          onClick={() => setMode({ kind: "add" })}
          className="btn-ghost mt-4"
        >
          + Adicionar loja
        </button>
      )}

      {mode.kind === "view" && lojas[mode.index] && (
        <LojaModal
          loja={lojas[mode.index]}
          index={mode.index}
          onClose={() => setMode({ kind: "list" })}
          onEdit={() => setMode({ kind: "edit", index: mode.index })}
        />
      )}
    </fieldset>
  );
}

function LojaModal({
  loja,
  index,
  onClose,
  onEdit,
}: {
  loja: Loja;
  index: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const extras = extrasOf(loja);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="loja-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 fade-in"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={onClose}
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
      />
      <div
        className="relative w-full max-w-[860px] max-h-[88vh] flex flex-col rounded-2xl scale-in"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-6 pt-5 pb-4"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="label-eyebrow mb-1.5">Loja</div>
            <h2
              id="loja-modal-title"
              className="serif text-[24px] leading-tight text-[color:var(--fg)]"
            >
              {loja.nome}
            </h2>
            {loja.crm_id && (
              <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1.5">
                CRM ID: <span className="numerics">{loja.crm_id}</span>
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-lg flex items-center justify-center text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--ink-3)] transition-colors"
            aria-label="Fechar"
            style={{ border: "1px solid var(--b-soft)" }}
          >
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-auto px-6 py-5 space-y-4">
          <section className="grid grid-cols-2 gap-3">
            <Item k="Área de atuação" v={`${loja.area_atuacao} km`} />
            <Item k="Consumo mínimo" v={String(loja.consumo_minimo)} />
          </section>

          {Object.keys(extras).length > 0 && (
            <section>
              <div className="label-eyebrow mb-2">Campos extras</div>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(extras).map(([k, v]) => (
                  <Item key={k} k={k} v={String(v)} />
                ))}
              </div>
            </section>
          )}
        </div>

        <footer
          className="px-6 py-4 flex items-center justify-end gap-3"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <form action={removeLojaAction}>
            <input type="hidden" name="index" value={index} />
            <button
              type="submit"
              className="btn-ghost"
              style={{ color: "#fca5a5" }}
              onClick={(e) => {
                if (!confirm(`Remover a loja "${loja.nome}"?`)) {
                  e.preventDefault();
                }
              }}
            >
              Remover
            </button>
          </form>
          <button type="button" onClick={onEdit} className="btn-primary">
            Editar
          </button>
        </footer>
      </div>
    </div>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="info-block">
      <p className="label-eyebrow">{k}</p>
      <p className="numerics text-[13px] mt-1 break-words">{v}</p>
    </div>
  );
}

function LojaForm({
  action,
  initial,
  index,
  isSuperadmin,
  onCancel,
  submitLabel,
}: {
  action: (formData: FormData) => Promise<void>;
  initial?: Loja;
  index?: number;
  isSuperadmin: boolean;
  onCancel: () => void;
  submitLabel: string;
}) {
  const extras = initial ? extrasOf(initial) : {};
  const initialPairs = Object.entries(extras).map(([k, v]) => ({
    key: k,
    value: typeof v === "string" ? v : JSON.stringify(v),
  }));
  const padded =
    isSuperadmin && initialPairs.length < 3
      ? [
          ...initialPairs,
          ...Array.from({ length: 3 - initialPairs.length }, () => ({
            key: "",
            value: "",
          })),
        ]
      : initialPairs;
  const [pairs, setPairs] = useState<{ key: string; value: string }[]>(padded);

  function addPair() {
    setPairs((p) => [...p, { key: "", value: "" }]);
  }
  function removePair(i: number) {
    setPairs((p) => p.filter((_, idx) => idx !== i));
  }
  function updatePair(i: number, field: "key" | "value", v: string) {
    setPairs((p) =>
      p.map((row, idx) => (idx === i ? { ...row, [field]: v } : row)),
    );
  }

  return (
    <form
      action={action}
      className="rounded-md p-4 space-y-4"
      style={{
        backgroundColor: "var(--ink-2)",
        border: "1px solid var(--b-base)",
      }}
    >
      {typeof index === "number" && (
        <input type="hidden" name="index" value={index} />
      )}

      <fieldset className="space-y-3">
        <legend className="label-eyebrow mb-1">Identificação</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Nome da loja"
            name="nome"
            defaultValue={initial?.nome ?? ""}
            required
          />
          <FormField
            label="CRM ID"
            name="crm_id"
            defaultValue={initial?.crm_id ?? ""}
            hint="ID da loja no CRM."
          />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="label-eyebrow mb-1">Operação</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormField
            label="Área de atuação (km)"
            name="area_atuacao"
            type="number"
            step="0.1"
            min="0"
            defaultValue={String(initial?.area_atuacao ?? 0)}
          />
          <FormField
            label="Consumo mínimo"
            name="consumo_minimo"
            type="number"
            step="1"
            min="0"
            defaultValue={String(initial?.consumo_minimo ?? 0)}
          />
        </div>
      </fieldset>

      {isSuperadmin && (
        <fieldset
          className="rounded-md p-4 space-y-3"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px dashed var(--b-base)",
          }}
        >
          <legend className="label-eyebrow mb-1 px-1">
            Campos extras (apenas superadmin)
          </legend>
          <p className="text-[11.5px] text-[color:var(--fg-subtle)] -mt-1 leading-relaxed">
            Adicione informações adicionais para esta loja. Cada campo tem uma{" "}
            <strong className="text-[color:var(--fg-muted)]">chave</strong>{" "}
            (nome curto, ex.: <span className="numerics">horario</span>) e um{" "}
            <strong className="text-[color:var(--fg-muted)]">valor</strong>.
            Números e <span className="numerics">true</span>/
            <span className="numerics">false</span> são interpretados
            automaticamente.
          </p>

          <ul className="space-y-2">
            {pairs.map((pair, i) => (
              <li
                key={i}
                className="grid gap-2 sm:grid-cols-[1fr_1fr_auto] items-end"
              >
                <label className="block">
                  <span className="block text-[11.5px] text-[color:var(--fg-subtle)] mb-1">
                    Chave
                  </span>
                  <input
                    name="extra_key"
                    value={pair.key}
                    onChange={(e) => updatePair(i, "key", e.target.value)}
                    placeholder="ex: horario_atendimento"
                    className="w-full rounded-[10px] py-[9px] px-3 text-[13px] font-mono"
                    style={{
                      backgroundColor: "var(--ink-2)",
                      color: "var(--fg)",
                      border: "1px solid var(--b-soft)",
                    }}
                  />
                </label>
                <label className="block">
                  <span className="block text-[11.5px] text-[color:var(--fg-subtle)] mb-1">
                    Valor
                  </span>
                  <input
                    name="extra_value"
                    value={pair.value}
                    onChange={(e) => updatePair(i, "value", e.target.value)}
                    placeholder="ex: 08:00-18:00"
                    className="w-full rounded-[10px] py-[9px] px-3 text-[13px]"
                    style={{
                      backgroundColor: "var(--ink-2)",
                      color: "var(--fg)",
                      border: "1px solid var(--b-soft)",
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removePair(i)}
                  className="btn-ghost text-[12px] py-[9px]"
                  aria-label="Remover campo"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <button
            type="button"
            onClick={addPair}
            className="btn-ghost text-[12.5px]"
          >
            + Adicionar campo
          </button>
        </fieldset>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-ghost">
          Cancelar
        </button>
        <button type="submit" className="btn-primary">
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function FormField({
  label,
  name,
  type = "text",
  defaultValue,
  required,
  hint,
  step,
  min,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  hint?: string;
  step?: string;
  min?: string;
}) {
  return (
    <label className="block">
      <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        step={step}
        min={min}
        defaultValue={defaultValue}
        className="w-full rounded-[10px] py-[10px] px-3 text-[14px]"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg)",
          border: "1px solid var(--b-soft)",
        }}
      />
      {hint && (
        <span className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5 block leading-snug">
          {hint}
        </span>
      )}
    </label>
  );
}

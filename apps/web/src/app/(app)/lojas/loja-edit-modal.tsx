"use client";

/**
 * @deprecated Substituído pelo drilldown em rota
 * `/clientes/[id]/lojas/[lojaId]/(dados|vendedores|leads)`. Mantido
 * por enquanto pra suportar HealthBadge legado e edição inline de
 * células na tabela de lojas raiz. Não adicionar novas
 * funcionalidades aqui — o form principal vive em
 * `clientes/[id]/lojas/[lojaId]/dados/loja-dados-form.tsx`.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Loja } from "@/lib/db/schema";
import {
  applyCanonicalShape,
  deleteLoja,
  updateLojaFields,
  type UpdateLojaPartial,
} from "./actions";
import type { LojaRow } from "./lojas-table";
import { lojaShapeIssues, pendenciasFor } from "./saude-loja";

type Field = {
  key: keyof UpdateLojaPartial;
  label: string;
  type?: "text" | "number" | "tel";
  full?: boolean;
};

type TabId = "info" | "endereco" | "agenda";
type TabDef = { id: TabId; label: string; fields: Field[] };

const TABS: TabDef[] = [
  {
    id: "info",
    label: "Informações",
    fields: [
      { key: "nome", label: "Nome da loja", full: true },
      { key: "crm_id", label: "CRM ID" },
      { key: "cnpj", label: "CNPJ" },
      { key: "telefone", label: "Telefone", type: "tel" },
    ],
  },
  {
    id: "endereco",
    label: "Endereço",
    fields: [
      { key: "endereco", label: "Endereço (legado, único campo)", full: true },
      { key: "endereco_cep", label: "CEP" },
      { key: "endereco_rua", label: "Rua" },
      { key: "endereco_numero", label: "Número" },
      { key: "endereco_bairro", label: "Bairro" },
      { key: "endereco_cidade", label: "Cidade" },
      { key: "endereco_estado", label: "Estado" },
      { key: "endereco_complemento", label: "Complemento", full: true },
    ],
  },
  {
    id: "agenda",
    label: "Configuração e agenda",
    fields: [
      { key: "area_atuacao", label: "Área de atuação (km)", type: "number" },
      { key: "consumo_minimo", label: "Consumo mínimo", type: "number" },
      { key: "agenda_qtd_slotes", label: "Slots por turno" },
      { key: "agenda_qtd_turnos", label: "Turnos por dia" },
      { key: "agenda_dias_frente", label: "Dias à frente" },
      { key: "agenda_tempo_slots", label: "Tempo do slot (min)" },
      { key: "agenda_max_dias_fente", label: "Max dias à frente" },
      { key: "agenda_tempo_antecessor", label: "Antecessor (min)" },
      { key: "agenda_tempo_antecedencia", label: "Antecedência (min)" },
    ],
  },
];

const ALL_FIELDS: Field[] = TABS.flatMap((t) => t.fields);

export function LojaEditModal({
  open,
  target,
  rows,
  isSuper,
  canEdit,
  onClose,
}: {
  open: boolean;
  target: LojaRow | null;
  rows: LojaRow[];
  isSuper: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [currentKey, setCurrentKey] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("info");

  const current = useMemo(() => {
    if (!currentKey) return null;
    const [cidStr, lid] = currentKey.split(":");
    const cid = Number(cidStr);
    return (
      rows.find((r) => r.clienteId === cid && r.loja.id === lid) ?? null
    );
  }, [currentKey, rows]);

  useEffect(() => {
    if (open && target) {
      setCurrentKey(`${target.clienteId}:${target.loja.id}`);
      setErr(null);
      setTab("info");
    }
  }, [open, target]);

  useEffect(() => {
    if (!current) return;
    const l = current.loja;
    setForm({
      nome: l.nome ?? "",
      crm_id: l.crm_id ?? "",
      cnpj: l.cnpj ?? "",
      telefone: l.telefone ?? "",
      endereco: l.endereco ?? "",
      endereco_cep: l.endereco_cep ?? "",
      endereco_rua: l.endereco_rua ?? "",
      endereco_numero: l.endereco_numero ?? "",
      endereco_bairro: l.endereco_bairro ?? "",
      endereco_cidade: l.endereco_cidade ?? "",
      endereco_estado: l.endereco_estado ?? "",
      endereco_complemento: l.endereco_complemento ?? "",
      area_atuacao: String(l.area_atuacao ?? 0),
      consumo_minimo: String(l.consumo_minimo ?? 0),
      agenda_qtd_slotes: l.agenda_qtd_slotes ?? "",
      agenda_qtd_turnos: l.agenda_qtd_turnos ?? "",
      agenda_dias_frente: l.agenda_dias_frente ?? "",
      agenda_tempo_slots: l.agenda_tempo_slots ?? "",
      agenda_max_dias_fente: l.agenda_max_dias_fente ?? "",
      agenda_tempo_antecessor: l.agenda_tempo_antecessor ?? "",
      agenda_tempo_antecedencia: l.agenda_tempo_antecedencia ?? "",
    });
    setErr(null);
  }, [current]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const pendencias = useMemo(
    () => (current ? pendenciasFor(current.loja) : []),
    [current],
  );
  const drift = useMemo(
    () =>
      current
        ? lojaShapeIssues(
            current.loja as unknown as Record<string, unknown>,
          )
        : [],
    [current],
  );

  if (!open || !current) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setErr(null);
    const patch: UpdateLojaPartial = {};
    for (const f of ALL_FIELDS) {
      const raw = form[f.key as string] ?? "";
      if (f.type === "number") {
        const n = raw.trim() === "" ? 0 : Number(raw.replace(",", "."));
        if (!Number.isFinite(n)) {
          setErr(`Campo ${f.label}: número inválido.`);
          return;
        }
        patch[f.key as keyof UpdateLojaPartial] = n;
      } else {
        patch[f.key as keyof UpdateLojaPartial] =
          raw.trim() === "" ? null : raw;
      }
    }
    startTransition(async () => {
      const res = await updateLojaFields(
        current.clienteId,
        current.loja.id,
        patch,
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!current) return;
    if (!confirm(`Remover loja "${current.loja.nome || "(sem nome)"}"?`)) return;
    startTransition(async () => {
      const res = await deleteLoja(current.clienteId, current.loja.id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleApplyShape() {
    if (!current) return;
    startTransition(async () => {
      const res = await applyCanonicalShape(
        current.clienteId,
        current.loja.id,
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backgroundColor: "rgba(2,8,5,0.62)",
        backdropFilter: "blur(2px)",
      }}
    >
      <form
        onSubmit={submit}
        className="w-full max-w-[920px] max-h-[92vh] overflow-y-auto rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between gap-3"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div className="min-w-0 flex-1">
            <div className="label-eyebrow">
              Loja {isSuper ? `· ${current.clienteNome ?? current.clienteTenant ?? "—"}` : ""}
            </div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)] truncate">
              {current.loja.nome || "(sem nome)"}
            </h2>
          </div>
          <LojaPicker
            rows={rows}
            currentKey={currentKey}
            onPick={(k) => setCurrentKey(k)}
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-[16px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
          >
            ✕
          </button>
        </div>

        {err && (
          <div
            className="px-5 py-2 text-[12px]"
            style={{
              backgroundColor: "var(--amber-bg)",
              color: "var(--amber-300)",
              borderBottom: "1px solid var(--amber-border)",
            }}
          >
            {err}
          </div>
        )}

        {(pendencias.length > 0 || drift.length > 0) && (
          <div
            className="mx-5 mt-4 px-3 py-2 rounded-md text-[12px] flex items-center gap-2 flex-wrap"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            <span
              aria-hidden
              className="size-1.5 rounded-full"
              style={{ backgroundColor: "var(--rose-300)" }}
            />
            {pendencias.length > 0 && (
              <span>
                <strong className="font-medium">
                  {pendencias.length} pendência
                  {pendencias.length === 1 ? "" : "s"}:
                </strong>{" "}
                {pendencias.map((p) => p.label).join(", ")}
              </span>
            )}
            {drift.length > 0 && (
              <span>
                <strong className="font-medium">
                  Shape divergente:
                </strong>{" "}
                {drift.length} item(s) — campos faltando ou extras.
                {canEdit && (
                  <button
                    type="button"
                    onClick={handleApplyShape}
                    disabled={pending}
                    className="ml-2 underline hover:text-[color:var(--mint-300)]"
                  >
                    Aplicar shape canônico
                  </button>
                )}
              </span>
            )}
          </div>
        )}

        <div
          className="px-5 pt-3 flex items-center gap-1"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            const count = pendencias.filter((p) =>
              t.fields.some((f) => (f.key as string) === (p.key as string)),
            ).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className="text-[12px] px-3 py-1.5 rounded-t-md inline-flex items-center gap-1.5"
                style={{
                  backgroundColor: active ? "var(--ink-3)" : "transparent",
                  color: active ? "var(--fg)" : "var(--fg-muted)",
                  border: active
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                  borderBottom: active
                    ? "1px solid var(--ink-3)"
                    : undefined,
                  marginBottom: "-1px",
                }}
              >
                {t.label}
                {count > 0 && (
                  <span
                    className="px-1.5 rounded-full text-[10px]"
                    style={{
                      backgroundColor: "var(--rose-bg)",
                      color: "var(--rose-300)",
                      border: "1px solid var(--rose-border)",
                    }}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(TABS.find((t) => t.id === tab)?.fields ?? []).map((f) => {
            const isPendente = pendencias.some(
              (p) => (p.key as string) === (f.key as string),
            );
            const value = form[f.key as string] ?? "";
            return (
              <label
                key={f.key as string}
                className={`flex flex-col gap-1 ${f.full ? "sm:col-span-2" : ""}`}
              >
                <span className="text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                  <span style={{ color: "var(--fg-subtle)" }}>{f.label}</span>
                  {isPendente && (
                    <span
                      aria-hidden
                      title="Pendente"
                      className="size-1.5 rounded-full"
                      style={{ backgroundColor: "var(--rose-300)" }}
                    />
                  )}
                </span>
                <input
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "any" : undefined}
                  value={value}
                  onChange={(e) => set(f.key as string, e.target.value)}
                  disabled={pending || !canEdit}
                  className="text-[13px] px-2.5 py-1.5 rounded-md"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    border: isPendente
                      ? "1.5px solid var(--rose-border)"
                      : "1px solid var(--b-soft)",
                    color: "var(--fg)",
                    outline: "none",
                  }}
                />
              </label>
            );
          })}
        </div>

        <div
          className="px-5 py-3 flex items-center justify-between gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <span className="text-[11px] text-[color:var(--fg-subtle)]">
            id: {current.loja.id.slice(0, 8)}…
          </span>
          <div className="flex items-center gap-2">
            {canEdit && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="chip chip-red text-[12px] px-3 py-1.5"
              >
                Remover
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="text-[12px] px-3 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
            >
              Cancelar
            </button>
            {canEdit && (
              <button
                type="submit"
                disabled={pending}
                className="chip chip-mint text-[12px] px-3 py-1.5"
              >
                {pending ? "Salvando…" : "Salvar"}
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function LojaPicker({
  rows,
  currentKey,
  onPick,
}: {
  rows: LojaRow[];
  currentKey: string | null;
  onPick: (k: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (open) {
      window.setTimeout(() => inputRef.current?.focus(), 30);
    } else {
      setQuery("");
    }
  }, [open]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const sorted = [...rows].sort((a, b) =>
      (a.loja.nome ?? "").localeCompare(b.loja.nome ?? "", "pt-BR", {
        sensitivity: "base",
      }),
    );
    if (!q) return sorted;
    return sorted.filter((r) =>
      [
        r.loja.nome,
        r.loja.crm_id,
        r.loja.endereco_cidade,
        r.clienteNome,
      ]
        .map((v) => String(v ?? "").toLowerCase())
        .some((s) => s.includes(q)),
    );
  }, [rows, q]);

  return (
    <div ref={ref} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="text-[12px] px-2.5 py-1 rounded-md inline-flex items-center gap-1.5 transition-colors"
        style={{
          backgroundColor: "var(--ink-3)",
          color: open ? "var(--mint-300)" : "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
          height: "26px",
        }}
        title="Trocar loja"
      >
        <span aria-hidden className="text-[10px]">⇆</span>
        <span>Trocar loja</span>
        <span aria-hidden className="text-[9px]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-30 w-[340px] rounded-md"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
          }}
        >
          <div
            className="p-2"
            style={{ borderBottom: "1px solid var(--b-soft)" }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar loja por nome, CRM, cidade..."
              className="w-full text-[12.5px] px-2 py-1 rounded"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </div>
          <div className="max-h-[280px] overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3 py-3 text-[11.5px] text-[color:var(--fg-subtle)] text-center">
                Nenhuma loja.
              </div>
            ) : (
              filtered.map((r) => {
                const k = `${r.clienteId}:${r.loja.id}`;
                const isCurrent = k === currentKey;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      if (!isCurrent) onPick(k);
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-1.5 hover:bg-[color:var(--ink-4)] transition-colors"
                    style={{
                      backgroundColor: isCurrent
                        ? "var(--ink-4)"
                        : undefined,
                      borderLeft: isCurrent
                        ? "2px solid var(--mint-300)"
                        : "2px solid transparent",
                    }}
                  >
                    <div
                      className="text-[12.5px] truncate"
                      style={{
                        color: isCurrent ? "var(--mint-200)" : "var(--fg)",
                      }}
                    >
                      {r.loja.nome || "(sem nome)"}
                      {isCurrent && (
                        <span
                          className="ml-1.5 text-[10px]"
                          style={{ color: "var(--mint-300)" }}
                        >
                          ✓ atual
                        </span>
                      )}
                    </div>
                    <div className="text-[10.5px] text-[color:var(--fg-subtle)] truncate numerics">
                      {r.clienteNome ?? r.clienteTenant ?? "—"}
                      {r.loja.endereco_cidade && (
                        <> · {r.loja.endereco_cidade}</>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

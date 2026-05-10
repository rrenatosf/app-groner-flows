"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Loja } from "@/lib/db/schema";
import {
  applyCanonicalShape,
  deleteLoja,
  updateLojaFields,
  type UpdateLojaPartial,
} from "../../../../../lojas/actions";
import {
  lojaShapeIssues,
  pendenciasFor,
} from "../../../../../lojas/saude-loja";

type Field = {
  key: keyof UpdateLojaPartial;
  label: string;
  type?: "text" | "number" | "tel";
  full?: boolean;
  group: "info" | "endereco" | "agenda";
  hint?: string;
};

const FIELDS: Field[] = [
  // Informações
  { key: "nome", label: "Nome da loja", full: true, group: "info" },
  { key: "crm_id", label: "CRM ID", group: "info" },
  { key: "cnpj", label: "CNPJ", group: "info" },
  { key: "telefone", label: "Telefone", type: "tel", group: "info" },
  // Endereço
  {
    key: "endereco",
    label: "Endereço (legado, único campo)",
    full: true,
    group: "endereco",
  },
  { key: "endereco_cep", label: "CEP", group: "endereco" },
  { key: "endereco_rua", label: "Rua", group: "endereco" },
  { key: "endereco_numero", label: "Número", group: "endereco" },
  { key: "endereco_bairro", label: "Bairro", group: "endereco" },
  { key: "endereco_cidade", label: "Cidade", group: "endereco" },
  { key: "endereco_estado", label: "Estado", group: "endereco" },
  {
    key: "endereco_complemento",
    label: "Complemento",
    full: true,
    group: "endereco",
  },
  // Agenda
  {
    key: "area_atuacao",
    label: "Área de atuação (km)",
    type: "number",
    group: "agenda",
    hint: "Raio em quilômetros que essa loja atende. Leads fora desse raio podem ser desqualificados por área de atuação.",
  },
  {
    key: "consumo_minimo",
    label: "Consumo mínimo",
    type: "number",
    group: "agenda",
    hint: "Consumo mínimo (em kWh) que o lead precisa ter pra qualificar nessa loja. Abaixo disso pode cair em desqualificação por consumo insuficiente.",
  },
  {
    key: "agenda_qtd_slotes",
    label: "Horários por turno",
    group: "agenda",
    hint: "Quantos horários livres o sistema mostra dentro de cada turno sugerido. Ex: 3 = cada turno traz até 3 horários (09:00, 10:00, 11:00). Default 2.",
  },
  {
    key: "agenda_qtd_turnos",
    label: "Turnos sugeridos",
    group: "agenda",
    hint: "Quantos turnos o sistema sugere quando o horário pedido não está disponível. Ex: 3 = sugere até 3 blocos (Hoje Tarde, Amanhã Manhã, Amanhã Tarde). Default 2.",
  },
  {
    key: "agenda_dias_frente",
    label: "Dias à frente (busca)",
    group: "agenda",
    hint: "Janela de busca: quantos dias à frente da data pedida o sistema vasculha vagas. Ex: 4 = se lead pediu segunda, busca de segunda até sexta. Default 1.",
  },
  {
    key: "agenda_tempo_slots",
    label: "Duração do slot (min)",
    group: "agenda",
    hint: "Duração em minutos de cada bloco de horário. Ex: 60 = slots de 1h (09:00–10:00, 10:00–11:00...). Ex: 30 = slots de meia hora. Default 60.",
  },
  {
    key: "agenda_max_dias_fente",
    label: "Limite máx. (min)",
    group: "agenda",
    hint: "Limite máximo absoluto em minutos no futuro que aceita agendar. Pedidos acima disso são recusados como 'fora_do_limite'. Default 20160 (≈14 dias).",
  },
  {
    key: "agenda_tempo_antecessor",
    label: "Antecedência mínima (min)",
    group: "agenda",
    hint: "Tempo mínimo em minutos entre agora e o horário a marcar. Impede o lead marcar 'pra daqui a 10 minutos'. Ex: 120 = se agora 14:00, primeiro horário válido é 16:00. Default 120.",
  },
  {
    key: "agenda_tempo_antecedencia",
    label: "Distância p/ sugerir antes (min)",
    group: "agenda",
    hint: "Distância mínima em minutos entre agora e o horário pedido pra o sistema poder sugerir horários ANTERIORES ao solicitado. Evita sugerir 'antes' quando o pedido já tá próximo. Default 120.",
  },
];

const GROUPS: { id: Field["group"]; label: string }[] = [
  { id: "info", label: "Informações" },
  { id: "endereco", label: "Endereço" },
  { id: "agenda", label: "Configuração e agenda" },
];

/**
 * Form da aba "Dados" da loja — adaptado de loja-edit-modal.tsx.
 * Mostra todos os campos agrupados em seções (info / endereço / agenda).
 * Save via `updateLojaFields(clienteId, lojaId, patch)` — server action
 * já existente, sem mudança.
 */
export function LojaDadosForm({
  clienteId,
  loja,
  canEdit,
}: {
  clienteId: number;
  loja: Loja;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [form, setForm] = useState<Record<string, string>>(() => initial(loja));

  useEffect(() => {
    setForm(initial(loja));
    setErr(null);
    setSavedOk(false);
  }, [loja.id]);

  const pendencias = useMemo(() => pendenciasFor(loja), [loja]);
  const drift = useMemo(
    () => lojaShapeIssues(loja as unknown as Record<string, unknown>),
    [loja],
  );

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSavedOk(false);
    const patch: UpdateLojaPartial = {};
    for (const f of FIELDS) {
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
      const res = await updateLojaFields(clienteId, loja.id, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setSavedOk(true);
      router.refresh();
      setTimeout(() => setSavedOk(false), 2500);
    });
  }

  function handleDelete() {
    if (!window.confirm(`Remover loja "${loja.nome || "(sem nome)"}"?`))
      return;
    startTransition(async () => {
      const res = await deleteLoja(clienteId, loja.id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.push(`/clientes/${clienteId}/lojas`);
      router.refresh();
    });
  }

  function handleApplyShape() {
    startTransition(async () => {
      const res = await applyCanonicalShape(clienteId, loja.id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="p-5 space-y-5">
      {err && (
        <div
          className="px-3 py-2 rounded-md text-[12px]"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            border: "1px solid var(--amber-border)",
          }}
        >
          {err}
        </div>
      )}
      {savedOk && (
        <div
          className="px-3 py-2 rounded-md text-[12px] inline-flex items-center gap-2"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-muted)",
            border: "1px solid var(--b-base)",
          }}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden style={{ color: "var(--mint-300)" }}>✓</span>
          <span>Loja salva.</span>
        </div>
      )}

      {drift.length > 0 && (
        <div
          className="rounded-md p-3 text-[11.5px]"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            border: "1px solid var(--amber-border)",
          }}
        >
          <strong>Estrutura legada:</strong> esta loja tem {drift.length}{" "}
          campo{drift.length === 1 ? "" : "s"} fora do shape canonical.
          {canEdit && (
            <button
              type="button"
              onClick={handleApplyShape}
              disabled={pending}
              className="ml-2 underline"
            >
              Aplicar shape canonical
            </button>
          )}
        </div>
      )}

      {GROUPS.map((g) => (
        <section key={g.id} className="space-y-2">
          <h3 className="label-eyebrow">{g.label}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {FIELDS.filter((f) => f.group === g.id).map((f) => {
              const isPendente = pendencias.some((p) => p.key === f.key);
              const value = form[f.key as string] ?? "";
              return (
                <label
                  key={f.key as string}
                  className={`flex flex-col gap-1 ${f.full ? "sm:col-span-2" : ""}`}
                >
                  <span className="text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <span style={{ color: "var(--fg-subtle)" }}>{f.label}</span>
                    {f.hint && (
                      <span
                        aria-label={f.hint}
                        title={f.hint}
                        className="inline-flex items-center justify-center cursor-help select-none"
                        style={{
                          width: 13,
                          height: 13,
                          borderRadius: "50%",
                          border: "1px solid var(--b-base)",
                          color: "var(--fg-muted)",
                          fontSize: 9,
                          fontStyle: "italic",
                          fontWeight: 600,
                          lineHeight: 1,
                        }}
                      >
                        i
                      </span>
                    )}
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
                    value={value}
                    onChange={(e) => set(f.key as string, e.target.value)}
                    disabled={pending || !canEdit}
                    title={f.hint}
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
        </section>
      ))}

      <div
        className="flex items-center justify-between gap-2 pt-3"
        style={{ borderTop: "1px solid var(--b-soft)" }}
      >
        <span className="text-[11px] text-[color:var(--fg-subtle)]">
          {pendencias.length === 0
            ? "Cadastro completo."
            : `${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"}`}
        </span>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="chip chip-red text-[12px] px-3 py-1.5"
            >
              Remover loja
            </button>
          )}
          <button
            type="submit"
            disabled={pending || !canEdit}
            className="chip chip-mint text-[12px] px-3 py-1.5"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </form>
  );
}

function initial(l: Loja): Record<string, string> {
  return {
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
  };
}

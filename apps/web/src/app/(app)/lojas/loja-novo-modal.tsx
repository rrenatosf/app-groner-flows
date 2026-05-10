"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import { fetchCrmLojasForClienteAction } from "@/server/actions/cliente-crm";
import { LOJA_AGENDA_DEFAULTS } from "@/lib/db/schema";
import { createLoja, type CreateLojaInput } from "./actions";
import type { LojaRow } from "./lojas-table";

type CrmLojaSummary = {
  id: string | number | null;
  nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  endereco_cep: string | null;
  endereco_rua: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
};

export function LojaNovoModal({
  open,
  rows,
  isSuper,
  forcedClienteId,
  forcedClienteNome,
  onClose,
}: {
  open: boolean;
  rows: LojaRow[];
  isSuper: boolean;
  /** Quando vier preenchido, modal trava nesse cliente (drilldown).
   *  Independe de `rows` — funciona mesmo com lista vazia. */
  forcedClienteId?: number;
  forcedClienteNome?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingCrm, startCrm] = useTransition();
  const [pendingImport, startImport] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [clienteId, setClienteId] = useState<number | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Lojas vindas do CRM pra opção de importar.
  const [crmLojas, setCrmLojas] = useState<CrmLojaSummary[] | null>(null);
  const [crmErr, setCrmErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Lista de clientes únicos derivada das rows. Quando forcedClienteId
  // vem preenchido (modo drilldown), garante que ele esteja na lista
  // mesmo se rows estiver vazio (cliente sem lojas ainda).
  const clientes = useMemo(() => {
    const seen = new Map<number, { id: number; nome: string }>();
    if (forcedClienteId !== undefined) {
      seen.set(forcedClienteId, {
        id: forcedClienteId,
        nome: forcedClienteNome ?? `Cliente #${forcedClienteId}`,
      });
    }
    for (const r of rows) {
      if (!seen.has(r.clienteId)) {
        seen.set(r.clienteId, {
          id: r.clienteId,
          nome: r.clienteNome ?? r.clienteTenant ?? `Cliente #${r.clienteId}`,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
    );
  }, [rows, forcedClienteId, forcedClienteNome]);

  // Reset do form/state quando modal abre. Deps fixas: só `open`.
  useEffect(() => {
    if (!open) return;
    setForm({ ...LOJA_AGENDA_DEFAULTS });
    setErr(null);
    setCrmLojas(null);
    setCrmErr(null);
    setPicked(new Set());
    window.setTimeout(() => firstInputRef.current?.focus(), 30);
  }, [open]);

  // Auto-seleção de clienteId. Deps separadas pra evitar mismatch de
  // tamanho do array entre HMR ticks.
  useEffect(() => {
    if (!open) return;
    if (forcedClienteId !== undefined) {
      setClienteId(forcedClienteId);
    } else {
      setClienteId(clientes.length === 1 ? clientes[0].id : null);
    }
  }, [open, clientes, forcedClienteId]);

  // Quando user escolhe cliente, busca lojas no CRM daquele tenant.
  useEffect(() => {
    if (!open || clienteId === null) {
      setCrmLojas(null);
      setCrmErr(null);
      setPicked(new Set());
      return;
    }
    setCrmLojas(null);
    setCrmErr(null);
    startCrm(async () => {
      const res = await fetchCrmLojasForClienteAction(clienteId);
      if (!res.ok) {
        setCrmErr(res.error);
        return;
      }
      setCrmLojas(
        res.lojas.map((l) => ({
          id: l.id ?? null,
          nome: l.nome ?? null,
          cnpj: l.cnpj ?? null,
          telefone: l.telefone ?? null,
          endereco_cep: l.endereco_cep ?? null,
          endereco_rua: l.endereco_rua ?? null,
          endereco_bairro: l.endereco_bairro ?? null,
          endereco_cidade: l.endereco_cidade ?? null,
          endereco_estado: l.endereco_estado ?? null,
          endereco_numero: l.endereco_numero ?? null,
          endereco_complemento: l.endereco_complemento ?? null,
        })),
      );
    });
  }, [open, clienteId]);

  const isDirty = useDirtyForm({ ...LOJA_AGENDA_DEFAULTS } as Record<string, string>, form);

  if (!open) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function togglePicked(crmId: string) {
    const next = new Set(picked);
    if (next.has(crmId)) next.delete(crmId);
    else next.add(crmId);
    setPicked(next);
  }
  const allPicked =
    crmLojas !== null &&
    crmLojas.length > 0 &&
    crmLojas.every((l) => picked.has(String(l.id ?? "")));
  function pickAll() {
    if (!crmLojas) return;
    setPicked(new Set(crmLojas.map((l) => String(l.id ?? ""))));
  }
  function clearPicked() {
    setPicked(new Set());
  }

  function importPicked() {
    if (!crmLojas || clienteId === null || picked.size === 0) return;
    const toImport = crmLojas.filter((l) => picked.has(String(l.id ?? "")));
    startImport(async () => {
      let success = 0;
      let lastErr: string | null = null;
      for (const l of toImport) {
        const res = await createLoja(clienteId, {
          nome: l.nome ?? "",
          crm_id: l.id !== null ? String(l.id) : null,
          cnpj: l.cnpj,
          telefone: l.telefone,
          endereco_cep: l.endereco_cep,
          endereco_rua: l.endereco_rua,
          endereco_bairro: l.endereco_bairro,
          endereco_cidade: l.endereco_cidade,
          endereco_estado: l.endereco_estado,
          endereco_numero: l.endereco_numero,
          endereco_complemento: l.endereco_complemento,
        });
        if (res.ok) success++;
        else lastErr = res.error;
      }
      if (success > 0) {
        onClose();
        router.refresh();
      } else if (lastErr) {
        setErr(`Falha ao importar: ${lastErr}`);
      }
    });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (clienteId === null) {
      setErr("Selecione o cliente.");
      return;
    }
    const input: CreateLojaInput = {
      nome: form.nome ?? "",
      crm_id: form.crm_id || null,
      cnpj: form.cnpj || null,
      telefone: form.telefone || null,
      endereco_cep: form.endereco_cep || null,
      endereco_rua: form.endereco_rua || null,
      endereco_bairro: form.endereco_bairro || null,
      endereco_cidade: form.endereco_cidade || null,
      endereco_estado: form.endereco_estado || null,
      endereco_numero: form.endereco_numero || null,
      endereco_complemento: form.endereco_complemento || null,
      area_atuacao: form.area_atuacao
        ? Number(form.area_atuacao.replace(",", "."))
        : null,
      consumo_minimo: form.consumo_minimo
        ? Number(form.consumo_minimo.replace(",", "."))
        : null,
      agenda_qtd_slotes: form.agenda_qtd_slotes || null,
      agenda_qtd_turnos: form.agenda_qtd_turnos || null,
      agenda_dias_frente: form.agenda_dias_frente || null,
      agenda_tempo_slots: form.agenda_tempo_slots || null,
      agenda_max_dias_fente: form.agenda_max_dias_fente || null,
      agenda_tempo_antecessor: form.agenda_tempo_antecessor || null,
      agenda_tempo_antecedencia: form.agenda_tempo_antecedencia || null,
    };
    startTransition(async () => {
      const res = await createLoja(clienteId, input);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Nova"
      title="Cadastro de loja"
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            Demais campos podem ser preenchidos depois inline ou no modal.
          </span>
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
          <button
            type="submit"
            form="modal-form"
            disabled={pending || clienteId === null}
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{ opacity: clienteId === null ? 0.5 : 1 }}
          >
            {pending ? "Criando…" : "Criar loja"}
          </button>
        </>
      }
    >
      <form id="modal-form" ref={formRef} onSubmit={submit}>
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

        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          {isSuper && clientes.length > 1 && (
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Cliente *
              </span>
              <SearchableSelect<{ id: number; nome: string }, number>
                items={clientes}
                value={clienteId}
                onChange={(k) => setClienteId(k)}
                getKey={(c) => c.id}
                getLabel={(c) => c.nome}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente por nome..."
                emptyLabel="Nenhum cliente encontrado."
                required
                disabled={pending}
                width={400}
              />
            </label>
          )}

          {clienteId !== null && (
            <div
              className="sm:col-span-2 rounded-md p-3 space-y-2"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="label-eyebrow">Lojas no CRM</div>
                  <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                    Importe lojas existentes no CRM ou preencha manualmente
                    abaixo.
                  </p>
                </div>
                {crmLojas && crmLojas.length > 0 && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={allPicked ? clearPicked : pickAll}
                      disabled={pendingImport}
                      className="text-[11px] px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: "var(--ink-2)",
                        color: "var(--fg-muted)",
                        border: "1px solid var(--b-soft)",
                      }}
                    >
                      {allPicked ? "Limpar" : "Selecionar todas"}
                    </button>
                  </div>
                )}
              </div>

              {pendingCrm && (
                <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                  Buscando lojas no CRM…
                </p>
              )}

              {crmErr && (
                <div
                  className="text-[11.5px] px-2 py-1.5 rounded"
                  style={{
                    backgroundColor: "var(--amber-bg)",
                    color: "var(--amber-300)",
                    border: "1px solid var(--amber-border)",
                  }}
                >
                  {crmErr}
                </div>
              )}

              {crmLojas && crmLojas.length === 0 && (
                <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                  Nenhuma loja encontrada no CRM desse cliente.
                </p>
              )}

              {crmLojas && crmLojas.length > 0 && (
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {crmLojas.map((l) => {
                    const k = String(l.id ?? "");
                    const isPicked = picked.has(k);
                    return (
                      <label
                        key={k || (l.nome ?? "")}
                        className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-[color:var(--ink-4)]"
                        style={{
                          backgroundColor: isPicked
                            ? "var(--ink-4)"
                            : undefined,
                          borderLeft: isPicked
                            ? "2px solid var(--mint-300)"
                            : "2px solid transparent",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isPicked}
                          onChange={() => togglePicked(k)}
                          disabled={pendingImport}
                          className="accent-[color:var(--mint-300)]"
                        />
                        <span
                          className="text-[12.5px] truncate"
                          style={{
                            color: isPicked ? "var(--mint-200)" : "var(--fg)",
                            flex: 1,
                          }}
                        >
                          {l.nome ?? "(sem nome)"}
                        </span>
                        <span className="text-[10.5px] text-[color:var(--fg-subtle)] truncate numerics">
                          {l.endereco_cidade && (
                            <>{l.endereco_cidade}</>
                          )}
                          {l.endereco_estado && (
                            <> · {l.endereco_estado}</>
                          )}
                          {l.id !== null && <> · crm_id {l.id}</>}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}

              {crmLojas && crmLojas.length > 0 && (
                <div className="flex items-center justify-end pt-1">
                  <button
                    type="button"
                    onClick={importPicked}
                    disabled={pendingImport || picked.size === 0}
                    className="chip chip-mint text-[12px] px-3 py-1"
                    style={{ opacity: picked.size === 0 ? 0.5 : 1 }}
                  >
                    {pendingImport
                      ? "Importando…"
                      : `Importar selecionadas${picked.size > 0 ? ` (${picked.size})` : ""}`}
                  </button>
                </div>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Nome da loja *
            </span>
            <input
              ref={firstInputRef}
              type="text"
              value={form.nome ?? ""}
              onChange={(e) => set("nome", e.target.value)}
              required
              disabled={pending}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            />
          </label>

          <Field name="crm_id" label="CRM ID" form={form} set={set} pending={pending} />
          <Field name="cnpj" label="CNPJ" form={form} set={set} pending={pending} />
          <Field
            name="telefone"
            label="Telefone"
            form={form}
            set={set}
            pending={pending}
            type="tel"
          />
          <Field
            name="area_atuacao"
            label="Área de atuação (km)"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Raio em quilômetros que essa loja atende. Leads fora desse raio podem ser desqualificados por área de atuação."
          />
          <Field
            name="consumo_minimo"
            label="Consumo mínimo"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Consumo mínimo (em kWh) que o lead precisa ter pra qualificar nessa loja. Abaixo disso pode cair em desqualificação por consumo insuficiente."
          />

          <SectionDivider label="Endereço" />
          <Field
            name="endereco_cep"
            label="CEP"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="endereco_rua"
            label="Rua"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="endereco_numero"
            label="Número"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="endereco_complemento"
            label="Complemento"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="endereco_bairro"
            label="Bairro"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="endereco_cidade"
            label="Cidade"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="endereco_estado"
            label="Estado"
            form={form}
            set={set}
            pending={pending}
          />

          <SectionDivider label="Agenda (defaults preenchidos — ajuste se precisar)" />
          <Field
            name="agenda_qtd_slotes"
            label="Horários por turno"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Quantos horários livres o sistema mostra dentro de cada turno sugerido. Ex: 3 = cada turno traz até 3 horários (09:00, 10:00, 11:00). Default 2."
          />
          <Field
            name="agenda_qtd_turnos"
            label="Turnos sugeridos"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Quantos turnos o sistema sugere quando o horário pedido não está disponível. Ex: 3 = sugere até 3 blocos (Hoje Tarde, Amanhã Manhã, Amanhã Tarde). Default 2."
          />
          <Field
            name="agenda_dias_frente"
            label="Dias à frente (busca)"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Janela de busca: quantos dias à frente da data pedida o sistema vasculha vagas. Ex: 4 = se lead pediu segunda, busca de segunda até sexta. Default 1."
          />
          <Field
            name="agenda_tempo_slots"
            label="Duração do slot (min)"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Duração em minutos de cada bloco de horário. Ex: 60 = slots de 1h (09:00–10:00, 10:00–11:00...). Ex: 30 = slots de meia hora. Default 60."
          />
          <Field
            name="agenda_max_dias_fente"
            label="Limite máx. (min)"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Limite máximo absoluto em minutos no futuro que aceita agendar. Pedidos acima disso são recusados como 'fora_do_limite'. Default 20160 (≈14 dias)."
          />
          <Field
            name="agenda_tempo_antecessor"
            label="Antecedência mínima (min)"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Tempo mínimo em minutos entre agora e o horário a marcar. Impede o lead marcar 'pra daqui a 10 minutos'. Ex: 120 = se agora 14:00, primeiro horário válido é 16:00. Default 120."
          />
          <Field
            name="agenda_tempo_antecedencia"
            label="Distância p/ sugerir antes (min)"
            form={form}
            set={set}
            pending={pending}
            type="number"
            hint="Distância mínima em minutos entre agora e o horário pedido pra o sistema poder sugerir horários ANTERIORES ao solicitado. Evita sugerir 'antes' quando o pedido já tá próximo. Default 120."
          />
        </div>

      </form>
    </ModalShell>
  );
}

function SectionDivider({ label }: { label: string }) {
  return (
    <div
      className="sm:col-span-2 mt-2 pb-1"
      style={{ borderBottom: "1px solid var(--b-base)" }}
    >
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
        {label}
      </span>
    </div>
  );
}

function Field({
  name,
  label,
  form,
  set,
  pending,
  type = "text",
  hint,
}: {
  name: string;
  label: string;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  pending: boolean;
  type?: "text" | "number" | "tel";
  /** Texto explicativo. Renderiza ícone (i) ao lado do label com
   *  tooltip nativo no hover. */
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1" title={hint}>
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)] inline-flex items-center gap-1.5">
        <span>{label}</span>
        {hint && (
          <span
            aria-label={hint}
            title={hint}
            className="inline-flex items-center justify-center select-none"
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
      </span>
      <input
        type={type}
        step={type === "number" ? "any" : undefined}
        value={form[name] ?? ""}
        onChange={(e) => set(name, e.target.value)}
        disabled={pending}
        title={hint}
        className="text-[13px] px-2.5 py-1.5 rounded-md"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
          color: "var(--fg)",
          outline: "none",
        }}
      />
    </label>
  );
}

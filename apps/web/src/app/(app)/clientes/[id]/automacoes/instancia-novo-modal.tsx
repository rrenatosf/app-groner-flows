"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import {
  assignAutomacaoToCliente,
  updateCatalogoAutomacaoFields,
  type AssignAutomacaoToClienteInput,
} from "../../../automacoes/actions";
import {
  getDefaultAutomacaoConfig,
  validateDadosConfiguracoes,
  type DadosConfigGroup,
} from "../../../automacoes/dados-config-shape";
import { autofillContextFields } from "../../../automacoes/dados-config-form";
import { ConfiguracoesForm } from "../../../automacoes/_form/ConfiguracoesForm";
import type { Automacao, CrmStatusSlot } from "@/lib/db/schema";

type LojaPick = {
  id: string;
  nome: string;
  crm_id?: string | null;
};

type ClientePick = {
  crmTenant: string | null;
  crmToken: string | null;
};

export function InstanciaNovoModal({
  open,
  clienteId,
  cliente,
  isSuper,
  lojas,
  catalogo,
  crmColunas,
  forcedLojaId,
  onClose,
}: {
  open: boolean;
  clienteId: number;
  cliente: ClientePick;
  isSuper: boolean;
  lojas: LojaPick[];
  catalogo: Automacao[];
  crmColunas: CrmStatusSlot[] | null;
  /** Se vier (drilldown loja), trava lojaId. */
  forcedLojaId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [automacaoId, setAutomacaoId] = useState<number | null>(null);
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState<DadosConfigGroup[]>(() =>
    getDefaultAutomacaoConfig(),
  );
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setErr(null);
      setAutomacaoId(null);
      setLojaId(forcedLojaId ?? null);
      setIsActive(true);
      setConfig(getDefaultAutomacaoConfig());
    }
  }, [open, forcedLojaId]);

  // Quando seleciona automação, copia template do catálogo (deep clone).
  useEffect(() => {
    if (!open || automacaoId === null) return;
    const cat = catalogo.find((c) => c.id === automacaoId);
    if (!cat) return;
    const tpl = Array.isArray(cat.dadosConfiguracoesTemplate)
      ? cat.dadosConfiguracoesTemplate
      : [];
    const cloned: DadosConfigGroup[] =
      tpl.length > 0
        ? (JSON.parse(JSON.stringify(tpl)) as DadosConfigGroup[])
        : getDefaultAutomacaoConfig();
    setConfig(cloned);
  }, [open, automacaoId, catalogo]);

  // Auto-fill campos contextuais (loja_id, cliente_id, crm_*) quando
  // loja é selecionada — só preenche campos vazios, não sobrescreve
  // valor já digitado pelo cliente.
  useEffect(() => {
    if (!lojaId) return;
    const loja = lojas.find((l) => l.id === lojaId);
    setConfig((prev) =>
      autofillContextFields(prev, { clienteId, lojaId, cliente, loja }),
    );
  }, [lojaId, clienteId, cliente, lojas]);

  const isDirty = useDirtyForm(
    { automacaoId: null as number | null, lojaId: forcedLojaId ?? null, isActive: true },
    { automacaoId, lojaId, isActive },
  );

  const selectedCat = useMemo(
    () => catalogo.find((c) => c.id === automacaoId) ?? null,
    [catalogo, automacaoId],
  );

  if (!open) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (automacaoId === null) {
      setErr("Selecione a automação do catálogo.");
      return;
    }
    if (!lojaId) {
      setErr("Selecione a loja.");
      return;
    }
    // Defesa em profundidade: revalida shape + limites antes do submit.
    const cfgRes = validateDadosConfiguracoes(config);
    if (!cfgRes.ok) {
      setErr(`Configurações inválidas: ${cfgRes.error}`);
      return;
    }
    const input: AssignAutomacaoToClienteInput = {
      automacaoId,
      clienteId,
      lojaId,
      isActive,
      dadosConfiguracoes: cfgRes.v,
    };
    const catSnapshot = selectedCat;
    startTransition(async () => {
      // Super editou o bloco `configuracoes_do_template`? Persiste no
      // catálogo (não na instância) — antes do assign pra que a nova
      // instância já leia o catálogo atualizado.
      if (isSuper && catSnapshot) {
        const tplGroup = cfgRes.v.find(
          (g) => Object.keys(g)[0] === "configuracoes_do_template",
        );
        if (tplGroup) {
          const inner = tplGroup["configuracoes_do_template"] as Record<
            string,
            unknown
          >;
          const newBaseUrl =
            typeof inner.base_url === "string" ? inner.base_url : null;
          const newWorkflowId =
            typeof inner.workflow_id === "string" ? inner.workflow_id : null;
          const changed =
            (newBaseUrl ?? "") !== (catSnapshot.baseUrl ?? "") ||
            (newWorkflowId ?? "") !== (catSnapshot.n8nWorkflowId ?? "");
          if (changed) {
            const catRes = await updateCatalogoAutomacaoFields(
              catSnapshot.id,
              {
                baseUrl: newBaseUrl,
                n8nWorkflowId: newWorkflowId,
              },
            );
            if (!catRes.ok) {
              setErr(`Falha ao atualizar catálogo: ${catRes.error}`);
              return;
            }
          }
        }
      }
      const res = await assignAutomacaoToCliente(input);
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
      eyebrow="Atribuir"
      title="Adicionar automação ao cliente"
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn-ghost"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="modal-form"
            disabled={pending || automacaoId === null || !lojaId}
            className="btn-primary"
          >
            {pending ? "Atribuindo…" : "Atribuir automação"}
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
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Automação do catálogo *
            </span>
            <SearchableSelect<Automacao, number>
              items={catalogo}
              value={automacaoId}
              onChange={setAutomacaoId}
              getKey={(c) => c.id}
              getLabel={(c) =>
                `${c.nome}${c.versao ? ` (v${c.versao})` : ""}`
              }
              placeholder="Selecione a automação"
              searchPlaceholder="Buscar automação..."
              required
              disabled={pending}
              width={400}
            />
            {catalogo.length === 0 && (
              <span
                className="text-[11px] mt-1 px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--amber-bg)",
                  color: "var(--amber-300)",
                  border: "1px solid var(--amber-border)",
                }}
              >
                Nenhuma automação ativa no catálogo. Peça pro superadmin
                cadastrar antes.
              </span>
            )}
          </label>

          {selectedCat && (
            <div className="sm:col-span-2 grid grid-cols-2 gap-3">
              <InfoBlock
                label="Base URL (catálogo)"
                value={selectedCat.baseUrl ?? "—"}
              />
              <InfoBlock
                label="Workflow n8n (catálogo)"
                value={selectedCat.n8nWorkflowId ?? "—"}
              />
              {selectedCat.descricao && (
                <div className="col-span-2">
                  <InfoBlock
                    label="Descrição"
                    value={selectedCat.descricao}
                  />
                </div>
              )}
            </div>
          )}

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Loja *
              {forcedLojaId !== undefined && (
                <span className="ml-1.5 text-[10px] text-[color:var(--mint-300)]">
                  (travada no drilldown da loja)
                </span>
              )}
            </span>
            <SearchableSelect<LojaPick, string>
              items={lojas}
              value={lojaId}
              onChange={setLojaId}
              getKey={(l) => l.id}
              getLabel={(l) => l.nome}
              placeholder="Selecione a loja"
              searchPlaceholder="Buscar loja..."
              required
              disabled={pending || forcedLojaId !== undefined}
              width={400}
            />
            {lojas.length === 0 && (
              <span
                className="text-[11px] mt-1 px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--amber-bg)",
                  color: "var(--amber-300)",
                  border: "1px solid var(--amber-border)",
                }}
              >
                Esse cliente ainda não tem lojas cadastradas. Cadastre uma
                loja antes de atribuir automação.
              </span>
            )}
          </label>

          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              disabled={pending}
              className="accent-[color:var(--mint-300)]"
            />
            <span className="text-[12.5px] text-[color:var(--fg-muted)]">
              Instância ativa
            </span>
          </label>

          <div className="sm:col-span-2">
            <ConfiguracoesForm
              value={config}
              onChange={setConfig}
              crmColunas={crmColunas}
              clienteId={clienteId}
              isSuper={isSuper}
              catalogo={
                selectedCat
                  ? {
                      baseUrl: selectedCat.baseUrl,
                      n8nWorkflowId: selectedCat.n8nWorkflowId,
                    }
                  : undefined
              }
              disabled={pending}
            />
          </div>
        </div>

      </form>
    </ModalShell>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-md p-3"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <div className="label-eyebrow">{label}</div>
      <div
        className="text-[12.5px] mt-1 numerics text-[color:var(--fg)]"
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          wordBreak: "break-all",
        }}
      >
        {value}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  JsonValidationModal,
  SearchableSelect,
} from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import {
  removeClienteAutomacao,
  updateCatalogoAutomacaoFields,
  updateClienteAutomacaoConfiguracoes,
  updateClienteAutomacaoFields,
  type UpdateClienteAutomacaoPartial,
} from "../../../automacoes/actions";
import {
  getDefaultAutomacaoConfig,
  validateDadosConfiguracoes,
  type DadosConfigGroup,
} from "../../../automacoes/dados-config-shape";
import { autofillContextFields } from "../../../automacoes/dados-config-form";
import { buildN8nWorkflowUrl } from "../../../automacoes/n8n-url";
import { ConfiguracoesForm } from "../../../automacoes/_form/ConfiguracoesForm";
import {
  buildInstanciaValidation,
  type InstanciaRowFull,
} from "../../../automacoes/saude-instancia";
import type { CrmStatusSlot } from "@/lib/db/schema";

type LojaPick = {
  id: string;
  nome: string;
  crm_id?: string | null;
};
type ClientePick = {
  crmTenant: string | null;
  crmToken: string | null;
};
type Tab = "vinculo" | "config" | "saude";

export function InstanciaEditModal({
  open,
  target,
  canEdit,
  isSuper,
  clienteId,
  cliente,
  lojas,
  crmColunas,
  embeddedLojaId,
  onClose,
}: {
  open: boolean;
  target: InstanciaRowFull | null;
  canEdit: boolean;
  isSuper: boolean;
  clienteId: number;
  cliente: ClientePick;
  lojas: LojaPick[];
  crmColunas: CrmStatusSlot[] | null;
  embeddedLojaId?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("vinculo");
  const [lojaId, setLojaId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(true);
  const [config, setConfig] = useState<DadosConfigGroup[]>([]);
  const [configErr, setConfigErr] = useState<string | null>(null);
  const [validacaoOpen, setValidacaoOpen] = useState(false);
  const [initialLojaId, setInitialLojaId] = useState<string | null>(null);
  const [initialIsActive, setInitialIsActive] = useState(true);
  const [initialConfig, setInitialConfig] = useState<DadosConfigGroup[]>([]);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open && target) {
      setTab("vinculo");
      setErr(null);
      setLojaId(target.lojaId ?? null);
      setInitialLojaId(target.lojaId ?? null);
      setIsActive(!!target.isActive);
      setInitialIsActive(!!target.isActive);
      const cfg = Array.isArray(target.dadosConfiguracoes)
        ? (target.dadosConfiguracoes as DadosConfigGroup[])
        : [];
      // Deep clone pra evitar mutação do row carregado.
      let cloned: DadosConfigGroup[] = [];
      try {
        cloned = JSON.parse(JSON.stringify(cfg)) as DadosConfigGroup[];
      } catch {
        cloned = [];
      }
      setConfig(cloned);
      setInitialConfig(cloned);
      setConfigErr(null);
    }
  }, [open, target]);

  const isDirty = useDirtyForm(
    { lojaId: initialLojaId, isActive: initialIsActive, config: initialConfig },
    { lojaId, isActive, config },
  );

  // Auto-fill campos contextuais (loja_id, cliente_id, crm_*) quando
  // loja muda — só preenche os vazios, não sobrescreve digitação.
  useEffect(() => {
    if (!lojaId) return;
    const loja = lojas.find((l) => l.id === lojaId);
    setConfig((prev) =>
      autofillContextFields(prev, { clienteId, lojaId, cliente, loja }),
    );
  }, [lojaId, clienteId, cliente, lojas]);

  const lojaTravada = embeddedLojaId !== undefined;

  const lojaNome = useMemo(() => {
    if (!target) return "";
    return lojas.find((l) => l.id === target.lojaId)?.nome ?? target.lojaId;
  }, [target, lojas]);

  // Snapshot do catálogo pra TemplateConfigCard (autofill + "Puxar do
  // template"). Só super interage com o card; cliente comum nem vê.
  const catalogoSnapshot = useMemo(
    () =>
      target
        ? {
            baseUrl: target.catalogoBaseUrl ?? null,
            n8nWorkflowId: target.catalogoWorkflowId ?? null,
          }
        : undefined,
    [target],
  );

  if (!open || !target) return null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErr(null);

    const patch: UpdateClienteAutomacaoPartial = { isActive };
    if (lojaId && lojaId !== target.lojaId && !lojaTravada) {
      patch.lojaId = lojaId;
    }

    // Defesa em profundidade: revalida shape + limites.
    const cfgRes = validateDadosConfiguracoes(config);
    if (!cfgRes.ok) {
      setTab("config");
      setConfigErr(cfgRes.error);
      setErr("Configurações inválidas — corrija antes de salvar.");
      return;
    }
    setConfigErr(null);

    const cfgPrev = JSON.stringify(target.dadosConfiguracoes ?? []);
    const cfgNext = JSON.stringify(cfgRes.v);
    const cfgChanged = cfgPrev !== cfgNext;

    // Snapshot pra closure (target pode ser nulled depois).
    const automacaoId = target.automacaoId;
    const catBaseUrlPrev = target.catalogoBaseUrl ?? null;
    const catWorkflowIdPrev = target.catalogoWorkflowId ?? null;

    startTransition(async () => {
      // Super editou o bloco `configuracoes_do_template`? Persiste no
      // catálogo (não na instância). Roda antes do save da instância.
      if (isSuper) {
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
            (newBaseUrl ?? "") !== (catBaseUrlPrev ?? "") ||
            (newWorkflowId ?? "") !== (catWorkflowIdPrev ?? "");
          if (changed) {
            const catRes = await updateCatalogoAutomacaoFields(automacaoId, {
              baseUrl: newBaseUrl,
              n8nWorkflowId: newWorkflowId,
            });
            if (!catRes.ok) {
              setErr(`Falha ao atualizar catálogo: ${catRes.error}`);
              return;
            }
          }
        }
      }
      const res = await updateClienteAutomacaoFields(target.id, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      if (cfgChanged) {
        const cfgSave = await updateClienteAutomacaoConfiguracoes(
          target.id,
          cfgRes.v,
        );
        if (!cfgSave.ok) {
          setErr(cfgSave.error);
          return;
        }
      }
      onClose();
      router.refresh();
    });
  }

  function handleRemove() {
    if (!target) return;
    if (
      !confirm(
        `Remover a instância "${target.catalogoNome ?? "(sem nome)"}" desta loja?\n\nO catálogo permanece intacto — você pode reatribuir depois.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await removeClienteAutomacao(target.id);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  const n8nLink =
    target.catalogoBaseUrl && target.catalogoWorkflowId
      ? buildN8nWorkflowUrl(target.catalogoBaseUrl, target.catalogoWorkflowId)
      : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={`Instância${target.catalogoVersao ? ` · v${target.catalogoVersao}` : ""} · ${lojaNome}`}
      title={target.catalogoNome ?? "(sem nome)"}
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            id: {target.id}
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={handleRemove}
              disabled={pending}
              className="btn-danger"
            >
              Remover instância
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="btn-ghost"
          >
            Cancelar
          </button>
          {canEdit && (
            <button
              type="submit"
              form="modal-form"
              disabled={pending}
              className="btn-primary"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          )}
        </>
      }
    >
      <form id="modal-form" ref={formRef} onSubmit={submit}>
        <div
          className="px-5 pt-3 flex items-center gap-1"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <TabButton
            active={tab === "vinculo"}
            onClick={() => setTab("vinculo")}
          >
            Vínculo
          </TabButton>
          <TabButton
            active={tab === "config"}
            onClick={() => setTab("config")}
          >
            Configurações
            {configErr && (
              <span
                className="ml-1.5 px-1.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                !
              </span>
            )}
          </TabButton>
          <TabButton
            active={tab === "saude"}
            onClick={() => setTab("saude")}
          >
            Saúde
          </TabButton>
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

        {tab === "vinculo" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Loja vinculada *
                {lojaTravada && (
                  <span className="ml-1.5 text-[10px] text-[color:var(--mint-300)]">
                    (travada no drilldown)
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
                disabled={pending || !canEdit || lojaTravada}
                width={400}
              />
            </label>

            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending || !canEdit}
                className="accent-[color:var(--mint-300)]"
              />
              <span className="text-[12.5px] text-[color:var(--fg-muted)]">
                Instância ativa
              </span>
            </label>

            <div className="sm:col-span-2 grid grid-cols-2 gap-3 mt-2">
              <InfoBlock
                label="Versão (catálogo)"
                value={target.catalogoVersao ?? "—"}
              />
              <InfoBlock
                label="Groner CRM ID"
                value={String(target.id)}
              />
              {isSuper && (
                <>
                  <InfoBlock
                    label="Base URL (catálogo)"
                    value={target.catalogoBaseUrl ?? "—"}
                  />
                  <InfoBlock
                    label="Workflow n8n (catálogo)"
                    value={target.catalogoWorkflowId ?? "—"}
                  />
                </>
              )}
            </div>

            {isSuper && n8nLink && (
              <div className="sm:col-span-2">
                <a
                  href={n8nLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-1.5"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    color: "var(--mint-300)",
                    border: "1px solid var(--b-soft)",
                  }}
                >
                  <span>↗</span>
                  <span>Abrir workflow no n8n</span>
                </a>
              </div>
            )}
          </div>
        )}

        {tab === "config" && (
          <div className="p-5 space-y-2">
            <ConfiguracoesForm
              value={config}
              onChange={(next) => {
                setConfig(next);
                setConfigErr(null);
              }}
              crmColunas={crmColunas}
              clienteId={clienteId}
              isSuper={isSuper}
              catalogo={catalogoSnapshot}
              disabled={pending || !canEdit}
            />
            <div className="flex items-center justify-between gap-2 pt-1">
              <p className="text-[11px] text-[color:var(--fg-subtle)]">
                Editar aqui afeta apenas esta instância — não muda o
                catálogo nem outras lojas.
              </p>
              <button
                type="button"
                onClick={() => {
                  const tpl = Array.isArray(target.catalogoTemplate)
                    ? target.catalogoTemplate
                    : [];
                  const next = tpl.length > 0
                    ? (JSON.parse(JSON.stringify(tpl)) as ReturnType<
                        typeof getDefaultAutomacaoConfig
                      >)
                    : getDefaultAutomacaoConfig();
                  if (
                    !confirm(
                      tpl.length > 0
                        ? "Substituir configurações atuais pelo template do catálogo dessa automação?"
                        : "Catálogo sem template definido. Substituir pelas 3 configurações canônicas padrão?",
                    )
                  )
                    return;
                  setConfig(next);
                  setConfigErr(null);
                }}
                disabled={pending || !canEdit}
                className="btn-ghost"
              >
                Restaurar template do catálogo
              </button>
            </div>
            {configErr && (
              <div
                className="text-[12px] px-3 py-2 rounded-md"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                {configErr}
              </div>
            )}
          </div>
        )}

        {tab === "saude" && (
          <div className="p-5 space-y-3">
            <div className="text-[12px] text-[color:var(--fg-muted)]">
              Diagnóstico da instância (vínculo + shape de configurações
              + dados herdados do catálogo).
            </div>
            <button
              type="button"
              onClick={() => setValidacaoOpen(true)}
              className="btn-ghost"
            >
              Abrir validação JSON
            </button>
          </div>
        )}

      </form>

      <JsonValidationModal
        open={validacaoOpen}
        title={`Instância: ${target.catalogoNome ?? "(sem nome)"}`}
        subtitle={`id ${target.id}${target.catalogoVersao ? ` · v${target.catalogoVersao}` : ""}`}
        fields={buildInstanciaValidation(target)}
        onClose={() => setValidacaoOpen(false)}
      />
    </ModalShell>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] px-3 py-1.5 rounded-t-md inline-flex items-center"
      style={{
        backgroundColor: active ? "var(--ink-3)" : "transparent",
        color: active ? "var(--fg)" : "var(--fg-muted)",
        border: active ? "1px solid var(--b-soft)" : "1px solid transparent",
        borderBottom: active ? "1px solid var(--ink-3)" : undefined,
        marginBottom: "-1px",
      }}
    >
      {children}
    </button>
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
        className="text-[13px] mt-1 numerics text-[color:var(--fg)]"
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

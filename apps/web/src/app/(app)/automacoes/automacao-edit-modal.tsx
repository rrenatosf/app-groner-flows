"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { JsonValidationModal } from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import {
  deleteCatalogoAutomacao,
  updateCatalogoAutomacaoFields,
  updateTemplateConfiguracoes,
  type UpdateCatalogoAutomacaoPartial,
} from "./actions";
import {
  type DadosConfigGroup,
  validateDadosConfiguracoes,
  validateSnakeCaseKeys,
  getDefaultAutomacaoConfig,
} from "./dados-config-shape";
import { TemplateBuilder } from "./_form/TemplateBuilder";
import {
  buildCatalogoValidation,
  pendenciasCatalogoFor,
  type CatalogoRow,
} from "./saude-catalogo";

type Tab = "dados" | "template" | "saude";

export function AutomacaoEditModal({
  open,
  target,
  canEdit,
  onClose,
}: {
  open: boolean;
  target: CatalogoRow | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("dados");
  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  // Template (jsonb) — texto pretty-printed editável.
  const [templateText, setTemplateText] = useState("[]");
  const [templateValid, setTemplateValid] = useState(true);
  const [templateErr, setTemplateErr] = useState<string | null>(null);
  const [comentarios, setComentarios] = useState<Record<string, string>>(
    {},
  );
  const [initialComentarios, setInitialComentarios] = useState<
    Record<string, string>
  >({});
  const [validacaoOpen, setValidacaoOpen] = useState(false);
  const [initialForm, setInitialForm] = useState<Record<string, string>>({});
  const [initialIsActive, setInitialIsActive] = useState(true);
  const [initialTemplate, setInitialTemplate] = useState("[]");
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open && target) {
      setTab("dados");
      setErr(null);
      const next = {
        nome: target.nome ?? "",
        descricao: target.descricao ?? "",
        baseUrl: target.baseUrl ?? "",
        n8nWorkflowId: target.n8nWorkflowId ?? "",
        versao: target.versao ?? "",
      };
      setForm(next);
      setInitialForm(next);
      setIsActive(!!target.isActive);
      setInitialIsActive(!!target.isActive);
      const tpl = Array.isArray(target.dadosConfiguracoesTemplate)
        ? target.dadosConfiguracoesTemplate
        : [];
      let tplText = "[]";
      try {
        tplText = JSON.stringify(tpl, null, 2);
      } catch {
        tplText = "[]";
      }
      setTemplateText(tplText);
      setInitialTemplate(tplText);
      setTemplateValid(true);
      setTemplateErr(null);
      const cmt =
        target.dadosComentarios && typeof target.dadosComentarios === "object"
          ? (target.dadosComentarios as Record<string, string>)
          : {};
      setComentarios(cmt);
      setInitialComentarios(cmt);
    }
  }, [open, target]);

  const isDirty = useDirtyForm(
    {
      form: initialForm,
      isActive: initialIsActive,
      templateText: initialTemplate,
      comentarios: initialComentarios,
    },
    { form, isActive, templateText, comentarios },
  );

  const pendencias = useMemo(
    () => (target ? pendenciasCatalogoFor(target) : []),
    [target],
  );

  // Parse pro builder. Erro vira array vazio — Validar mostra detalhe.
  const tplParsed = useMemo<DadosConfigGroup[]>(() => {
    try {
      const p = JSON.parse(templateText);
      if (!Array.isArray(p)) return [];
      return p as DadosConfigGroup[];
    } catch {
      return [];
    }
  }, [templateText]);

  if (!open || !target) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function validateTemplate(): { ok: true; v: unknown } | { ok: false; error: string } {
    let parsed: unknown;
    try {
      parsed = JSON.parse(templateText);
    } catch (e) {
      return {
        ok: false,
        error: `JSON inválido: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
    const v = validateDadosConfiguracoes(parsed);
    if (!v.ok) return { ok: false, error: v.error };
    const sk = validateSnakeCaseKeys(v.v);
    if (!sk.ok) return { ok: false, error: sk.error };
    return { ok: true, v: v.v };
  }

  function handleValidateClick() {
    const res = validateTemplate();
    if (!res.ok) {
      setTemplateValid(false);
      setTemplateErr(res.error);
    } else {
      setTemplateValid(true);
      setTemplateErr(null);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!target) return;
    setErr(null);

    const patch: UpdateCatalogoAutomacaoPartial = {
      nome: form.nome ?? "",
      descricao: form.descricao || null,
      baseUrl: form.baseUrl || null,
      n8nWorkflowId: form.n8nWorkflowId || null,
      versao: form.versao || null,
      isActive,
    };

    // Valida + salva template se houve mudança.
    const tplRes = validateTemplate();
    if (!tplRes.ok) {
      setTab("template");
      setTemplateValid(false);
      setTemplateErr(tplRes.error);
      setErr("Template inválido — corrija antes de salvar.");
      return;
    }
    setTemplateValid(true);
    setTemplateErr(null);

    const tplPrev = JSON.stringify(target.dadosConfiguracoesTemplate ?? []);
    const tplNext = JSON.stringify(tplRes.v);
    const tplChanged = tplPrev !== tplNext;
    const cmtPrev = JSON.stringify(target.dadosComentarios ?? {});
    const cmtNext = JSON.stringify(comentarios);
    const cmtChanged = cmtPrev !== cmtNext;

    startTransition(async () => {
      const res = await updateCatalogoAutomacaoFields(target.id, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      if (tplChanged || cmtChanged) {
        const tplSave = await updateTemplateConfiguracoes(
          target.id,
          tplRes.v,
          cmtChanged ? comentarios : undefined,
        );
        if (!tplSave.ok) {
          setErr(tplSave.error);
          return;
        }
      }
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!target) return;
    if (
      !confirm(
        `Apagar a automação "${target.nome ?? "(sem nome)"}" do catálogo?\n\nSe houver clientes usando, a operação é bloqueada.`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteCatalogoAutomacao(target.id);
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
      eyebrow={`Catálogo de automação${target.versao ? ` · v${target.versao}` : ""}`}
      title={target.nome ?? "(sem nome)"}
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
              onClick={handleDelete}
              disabled={pending}
              className="btn-danger"
            >
              Apagar
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
              disabled={pending || !templateValid}
              className="btn-primary"
              title={
                !templateValid
                  ? "Validar template antes de salvar"
                  : undefined
              }
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
          <TabButton active={tab === "dados"} onClick={() => setTab("dados")}>
            Dados
            {pendencias.length > 0 && (
              <span
                className="ml-1.5 px-1.5 rounded-full text-[10px]"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                {pendencias.length}
              </span>
            )}
          </TabButton>
          <TabButton
            active={tab === "template"}
            onClick={() => setTab("template")}
          >
            Template
            {!templateValid && (
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

        {tab === "dados" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <FieldText
              name="nome"
              label="Nome *"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="descricao"
              label="Descrição"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="baseUrl"
              label="Base URL (n8n)"
              full
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="n8nWorkflowId"
              label="ID workflow n8n"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <FieldText
              name="versao"
              label="Versão"
              form={form}
              set={set}
              pending={pending || !canEdit}
            />
            <label className="flex items-center gap-2 sm:col-span-2">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={pending || !canEdit}
                className="accent-[color:var(--mint-300)]"
              />
              <span className="text-[12.5px] text-[color:var(--fg-muted)]">
                Disponível pra novos clientes (catálogo ativo)
              </span>
            </label>
          </div>
        )}

        {tab === "template" && (
          <div className="p-5 space-y-2">
            <div
              className="text-[11px] px-3 py-2 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-base)",
              }}
            >
              <strong style={{ color: "var(--amber-300)" }}>
                Aviso:
              </strong>{" "}
              Editar o template aqui não afeta clientes que já têm essa
              automação atribuída. Atinge apenas instâncias futuras.
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-[color:var(--fg-subtle)]">
                Cada grupo (título) contém itens com nome e tipo. Template
                canônico tem 3 grupos: dados_de_configuracao, coluna_inicial,
                coluna_qualificacao.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const trimmed = templateText.trim();
                    const isEmpty = trimmed === "" || trimmed === "[]";
                    if (!isEmpty) {
                      if (
                        !confirm(
                          "Substituir template atual pelo padrão?",
                        )
                      )
                        return;
                    }
                    setTemplateText(
                      JSON.stringify(getDefaultAutomacaoConfig(), null, 2),
                    );
                    setTemplateValid(true);
                    setTemplateErr(null);
                  }}
                  disabled={pending || !canEdit}
                  className="btn-ghost"
                >
                  Aplicar template padrão
                </button>
                <button
                  type="button"
                  onClick={handleValidateClick}
                  disabled={pending}
                  className="btn-ghost"
                >
                  Validar
                </button>
              </div>
            </div>
            <TemplateBuilder
              value={tplParsed}
              onChange={(next) => {
                setTemplateText(JSON.stringify(next, null, 2));
                setTemplateValid(true);
                setTemplateErr(null);
              }}
              meta={comentarios}
              onMetaChange={setComentarios}
              disabled={pending || !canEdit}
            />
            {!templateValid && templateErr && (
              <div
                className="text-[12px] px-3 py-2 rounded-md"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                {templateErr}
              </div>
            )}
          </div>
        )}

        {tab === "saude" && (
          <div className="p-5 space-y-3">
            <div className="text-[12px] text-[color:var(--fg-muted)]">
              Diagnóstico do catálogo. Use o botão abaixo pra abrir a
              validação detalhada (campos esperados vs atuais).
            </div>
            <button
              type="button"
              onClick={() => setValidacaoOpen(true)}
              className="btn-ghost"
            >
              Abrir validação JSON
            </button>
            {pendencias.length > 0 && (
              <div
                className="text-[12px] px-3 py-2 rounded-md"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                Pendências críticas:{" "}
                {pendencias.map((p) => p.label).join(", ")}.
              </div>
            )}
          </div>
        )}

      </form>

      <JsonValidationModal
        open={validacaoOpen}
        title={`Catálogo: ${target.nome ?? "(sem nome)"}`}
        subtitle={`id ${target.id}${target.versao ? ` · v${target.versao}` : ""}`}
        fields={buildCatalogoValidation(target)}
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

function FieldText({
  name,
  label,
  type = "text",
  full,
  form,
  set,
  pending,
}: {
  name: string;
  label: string;
  type?: "text" | "number";
  full?: boolean;
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  pending: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
        {label}
      </span>
      <input
        type={type}
        value={form[name] ?? ""}
        onChange={(e) => set(name, e.target.value)}
        disabled={pending}
        className="input-edit"
      />
    </label>
  );
}

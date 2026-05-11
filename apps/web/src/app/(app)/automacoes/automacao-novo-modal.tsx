"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import {
  createCatalogoAutomacao,
  type CreateCatalogoAutomacaoInput,
} from "./actions";
import {
  type DadosConfigGroup,
  getDefaultAutomacaoConfig,
  validateDadosConfiguracoes,
  validateSnakeCaseKeys,
} from "./dados-config-shape";
import { TemplateBuilder } from "./_form/TemplateBuilder";

export function AutomacaoNovoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [templateText, setTemplateText] = useState("[]");
  const [templateValid, setTemplateValid] = useState(true);
  const [templateErr, setTemplateErr] = useState<string | null>(null);
  const [initialTemplate, setInitialTemplate] = useState("[]");
  const [comentarios, setComentarios] = useState<Record<string, string>>(
    {},
  );
  const [initialComentarios, setInitialComentarios] = useState<
    Record<string, string>
  >({});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setForm({});
      setErr(null);
      setIsActive(true);
      // Pré-popula com template canônico já no abrir.
      let initial = "[]";
      try {
        initial = JSON.stringify(getDefaultAutomacaoConfig(), null, 2);
      } catch {
        initial = "[]";
      }
      setTemplateText(initial);
      setInitialTemplate(initial);
      setTemplateValid(true);
      setTemplateErr(null);
      setComentarios({});
      setInitialComentarios({});
    }
  }, [open]);

  const isDirty = useDirtyForm(
    {
      form: {},
      isActive: true,
      templateText: initialTemplate,
      comentarios: initialComentarios,
    },
    { form, isActive, templateText, comentarios },
  );

  // Parse pro builder consumir. Erro vira array vazio — Validar mostra detalhe.
  const tplParsed = useMemo<DadosConfigGroup[]>(() => {
    try {
      const p = JSON.parse(templateText);
      if (!Array.isArray(p)) return [];
      return p as DadosConfigGroup[];
    } catch {
      return [];
    }
  }, [templateText]);

  if (!open) return null;

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
    setErr(null);
    if (!form.nome?.trim()) {
      setErr("Nome é obrigatório.");
      return;
    }
    const tplRes = validateTemplate();
    if (!tplRes.ok) {
      setTemplateValid(false);
      setTemplateErr(tplRes.error);
      setErr("Template inválido — corrija antes de criar.");
      return;
    }
    const input: CreateCatalogoAutomacaoInput = {
      nome: form.nome ?? "",
      descricao: form.descricao || null,
      baseUrl: form.baseUrl || null,
      n8nWorkflowId: form.n8nWorkflowId || null,
      versao: form.versao || null,
      isActive,
      dadosConfiguracoesTemplate: tplRes.v as ReturnType<
        typeof getDefaultAutomacaoConfig
      >,
      dadosComentarios: comentarios,
    };
    startTransition(async () => {
      const res = await createCatalogoAutomacao(input);
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
      title="Cadastro no catálogo"
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
            disabled={pending || !form.nome?.trim() || !templateValid}
            className="btn-primary"
          >
            {pending ? "Criando…" : "Criar no catálogo"}
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
              Nome *
            </span>
            <input
              type="text"
              value={form.nome ?? ""}
              onChange={(e) => set("nome", e.target.value)}
              required
              disabled={pending}
              className="input-edit"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Descrição
            </span>
            <input
              type="text"
              value={form.descricao ?? ""}
              onChange={(e) => set("descricao", e.target.value)}
              disabled={pending}
              className="input-edit"
            />
          </label>

          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Base URL (n8n)
            </span>
            <input
              type="text"
              value={form.baseUrl ?? ""}
              onChange={(e) => set("baseUrl", e.target.value)}
              disabled={pending}
              placeholder="https://n8n.dominio.com"
              className="input-edit"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              ID workflow n8n
            </span>
            <input
              type="text"
              value={form.n8nWorkflowId ?? ""}
              onChange={(e) => set("n8nWorkflowId", e.target.value)}
              disabled={pending}
              className="input-edit"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Versão
            </span>
            <input
              type="text"
              value={form.versao ?? ""}
              onChange={(e) => set("versao", e.target.value)}
              disabled={pending}
              className="input-edit"
            />
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
              Disponível pra novos clientes (catálogo ativo)
            </span>
          </label>

          <div className="sm:col-span-2 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                Template de configurações
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTemplateText(
                      JSON.stringify(getDefaultAutomacaoConfig(), null, 2),
                    );
                    setTemplateValid(true);
                    setTemplateErr(null);
                  }}
                  disabled={pending}
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
              disabled={pending}
            />
            <p className="text-[11px] text-[color:var(--fg-subtle)]">
              Esse template será copiado pra cada cliente que receber a
              automação. Cada grupo (título) contém itens com nome e tipo.
            </p>
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
        </div>

      </form>
    </ModalShell>
  );
}

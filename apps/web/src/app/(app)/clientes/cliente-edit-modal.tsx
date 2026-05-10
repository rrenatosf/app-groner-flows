"use client";

/**
 * @deprecated Substituído pelo drilldown em rota
 * `/clientes/[id]/(dados|colunas-crm|webhooks)`. Edição inline na
 * lista (`clientes-table.tsx`) ainda usa este modal pra alguns gates
 * (HealthBadge legado / ValidationBadge), mas todo o fluxo principal
 * de edição agora é navegação por rota. Será removido em refator
 * futuro — não adicionar novas funcionalidades aqui.
 *
 * As partes principais foram extraídas pra:
 *  - `clientes/[id]/dados/cliente-dados-form.tsx` (form Dados)
 *  - `clientes/[id]/colunas-crm/colunas-crm-form.tsx` (CrmStatusSlots)
 *  - `clientes/[id]/webhooks/webhooks-tab.tsx` (WebhooksTab)
 *  - `clientes/[id]/_components/pendencias-banner.tsx` (banner)
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateClienteFields,
  verifySuperPasswordAction,
  type UpdateClientePartial,
} from "./actions";
import {
  clearCrmStatusWebhookAction,
  deleteWhatsappWebhookForClienteAction,
  fetchWhatsappInstanciasForClienteAction,
  fetchWhatsappWebhooksForClienteAction,
  setWhatsappWebhookForClienteAction,
  fetchCrmStatusWithWebhookAction,
  fetchCrmWebhookGlobalAction,
  setCrmWebhookGlobalAction,
  type CrmStatusWithWebhook,
  type CrmWebhookGlobalEntry,
} from "@/server/actions/cliente-crm";
import { DEFAULT_CRM_WEBHOOK_GLOBAL_URL } from "@/lib/crm/slots";
import {
  GRONER_WEBHOOK_DEFAULT,
  type WhatsappWebhook,
} from "@/lib/whatsapp/webhook";
import type { ClienteRow } from "./clientes-table";
import { pendenciasFor, type CriticalField } from "./saude";
import { PasswordConfirm } from "@/components/password-confirm";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import { SecretInput } from "@/components/data-table";
import { CrmStatusSlots } from "@/components/crm/crm-status-slots";
import type { CrmStatusSlot, CrmStatusTipo } from "@/lib/db/schema";
import { DESQUALIFICADO_SLUGS } from "@/lib/crm/slots";

type Field = {
  key: keyof UpdateClientePartial;
  label: string;
  type?: "text" | "email" | "tel" | "password" | "url";
  full?: boolean;
  superOnly?: boolean;
  secret?: boolean;
};

const FIELDS: Field[] = [
  { key: "nome", label: "Nome", full: true },
  { key: "email", label: "E-mail", type: "email" },
  { key: "telefone", label: "Telefone", type: "tel" },
  {
    key: "senha",
    label: "Senha (vazio = manter atual)",
    type: "password",
    superOnly: true,
    secret: true,
  },
  { key: "crmTenant", label: "CRM Tenant" },
  { key: "crmOrigemId", label: "CRM Origem" },
  { key: "apiInstanciaNome", label: "Instância (WhatsApp)" },
  { key: "apiBaseUrl", label: "Base URL", secret: true },
  {
    key: "apiToken",
    label: "API Token",
    full: true,
    superOnly: true,
    secret: true,
  },
  {
    key: "crmToken",
    label: "CRM Token",
    full: true,
    superOnly: true,
    secret: true,
  },
];

type Instancia = {
  id: string;
  nome: string;
  displayName: string;
  telefone: string | null;
  status: string | null;
  baseUrl: string | null;
  token: string | null;
};

export function ClienteEditModal({
  open,
  cliente,
  clientes,
  isSuper,
  onClose,
}: {
  open: boolean;
  cliente: ClienteRow | null;
  clientes: ClienteRow[];
  isSuper: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingFetch, startFetch] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState<boolean>(true);
  const [isSuperadmin, setIsSuperadmin] = useState<boolean>(false);
  const [currentId, setCurrentId] = useState<number | null>(null);

  const [instancias, setInstancias] = useState<Instancia[] | null>(null);
  const [instErr, setInstErr] = useState<string | null>(null);
  const [pickedInstId, setPickedInstId] = useState<string | null>(null);

  // Aba ativa: "dados" (default) ou "crm-cols" (super-only).
  const [tab, setTab] = useState<"dados" | "crm-cols" | "webhooks">("dados");
  const [hoverTab, setHoverTab] = useState<
    "dados" | "crm-cols" | "webhooks" | null
  >(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Senha confirmada do super atuante — coletada quando o usuário
  // clica no checkbox isSuperadmin. Reusa no submit pra autorizar.
  const [verifiedSuperPw, setVerifiedSuperPw] = useState<string | null>(null);
  // Prompt aberto pelo click no checkbox isSuperadmin.
  const [checkboxPrompt, setCheckboxPrompt] = useState<{
    nextValue: boolean;
    pending: boolean;
    error: string | null;
  } | null>(null);

  const current = useMemo(
    () => clientes.find((c) => c.id === currentId) ?? null,
    [clientes, currentId],
  );

  // Inicializa currentId quando abre.
  useEffect(() => {
    if (open && cliente) {
      setCurrentId(cliente.id);
      setErr(null);
      setSavedOk(false);
      setInstancias(null);
      setInstErr(null);
      setPickedInstId(null);
      setVerifiedSuperPw(null);
      setCheckboxPrompt(null);
      setTab("dados");
    }
  }, [open, cliente]);

  const [initialForm, setInitialForm] = useState<Record<string, string>>({});
  const [initialIsActive, setInitialIsActive] = useState(true);
  const [initialIsSuperadmin, setInitialIsSuperadmin] = useState(false);

  // Re-inicializa form a cada troca de cliente atual.
  useEffect(() => {
    if (!current) return;
    const next = {
      nome: current.nome ?? "",
      email: current.email ?? "",
      telefone: current.telefone ?? "",
      senha: "",
      crmTenant: current.crmTenant ?? "",
      crmOrigemId: current.crmOrigemId ?? "",
      apiInstanciaNome: current.apiInstanciaNome ?? "",
      apiBaseUrl: current.apiBaseUrl ?? "",
      apiToken: current.apiToken ?? "",
      crmToken: current.crmToken ?? "",
    };
    setForm(next);
    setInitialForm(next);
    setIsActive(current.isActive ?? true);
    setInitialIsActive(current.isActive ?? true);
    setIsSuperadmin(current.isSuperadmin ?? false);
    setInitialIsSuperadmin(current.isSuperadmin ?? false);
    setInstancias(null);
    setInstErr(null);
    setPickedInstId(null);
    setErr(null);
    setSavedOk(false);
    setVerifiedSuperPw(null);
    setCheckboxPrompt(null);
  }, [current]);

  const isDirty = useDirtyForm(
    { form: initialForm, isActive: initialIsActive, isSuperadmin: initialIsSuperadmin },
    { form, isActive, isSuperadmin },
  );

  const pendencias = useMemo<CriticalField[]>(
    () => (current ? pendenciasFor(current, { isSuper }) : []),
    [current, isSuper],
  );

  if (!open || !current) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function fetchInstancias() {
    if (!current) return;
    setInstErr(null);
    startFetch(async () => {
      const res = await fetchWhatsappInstanciasForClienteAction(current.id);
      if (!res.ok) {
        setInstErr(res.error);
        setInstancias(null);
        return;
      }
      setInstancias(res.instancias);
      if (res.instancias.length === 0) {
        setInstErr("Nenhuma instância encontrada pra esse cliente.");
      }
    });
  }

  function applyInstancia(inst: Instancia) {
    setPickedInstId(inst.id);
    setForm((prev) => ({
      ...prev,
      apiInstanciaNome: inst.nome,
      apiBaseUrl: inst.baseUrl ?? prev.apiBaseUrl,
      apiToken: inst.token ?? prev.apiToken,
    }));
  }

  function buildPatch(): UpdateClientePartial | null {
    if (!current) return null;
    const patch: UpdateClientePartial = {};
    for (const f of FIELDS) {
      if (f.superOnly && !isSuper) continue;
      const raw = form[f.key as string] ?? "";
      if (f.key === "senha") {
        if (raw.trim() !== "") patch.senha = raw;
        continue;
      }
      (patch as Record<string, unknown>)[f.key as string] =
        raw.trim() === "" ? null : raw;
    }
    if (isSuper) {
      patch.isActive = isActive;
      // Só inclui isSuperadmin no patch se mudou — evita pedir senha à toa.
      if (isSuperadmin !== (current.isSuperadmin ?? false)) {
        patch.isSuperadmin = isSuperadmin;
      }
      // Slots do CRM — extraídos dos hidden inputs de CrmStatusSlots.
      if (formRef.current) {
        const fd = new FormData(formRef.current);
        const slotDefs: { slug: string; tipo: CrmStatusTipo; label: string }[] = [
          { slug: "inicial", tipo: "inicial", label: "Status inicial" },
          { slug: "qualificado", tipo: "qualificacao", label: "Status qualificado" },
          ...DESQUALIFICADO_SLUGS.map((d) => ({
            slug: d.slug,
            tipo: "desqualificacao" as CrmStatusTipo,
            label: d.labelDefault,
          })),
        ];
        const slots: CrmStatusSlot[] = [];
        let anyFilled = false;
        for (const def of slotDefs) {
          const id = String(fd.get(`id_${def.slug}`) ?? "").trim();
          const nome = String(fd.get(`nome_${def.slug}`) ?? "").trim();
          const notUsed = String(fd.get(`notused_${def.slug}`) ?? "") === "1";
          if (id || nome || notUsed) anyFilled = true;
          const slot: CrmStatusSlot = { slug: def.slug, tipo: def.tipo, id, nome };
          if (notUsed) slot.notUsed = true;
          slots.push(slot);
        }
        if (anyFilled) {
          patch.crmStatusColunas = slots;
        }
      }
    }
    return patch;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    setErr(null);
    const patch = buildPatch();
    if (!patch) return;
    const touchesSuper = Object.prototype.hasOwnProperty.call(
      patch,
      "isSuperadmin",
    );
    if (touchesSuper && !verifiedSuperPw) {
      // Defensivo — só chega aqui se UI for burlada. UI gate já no click.
      setErr(
        "Confirme a senha do superadmin marcando/desmarcando o checkbox novamente.",
      );
      return;
    }
    runUpdate(patch, touchesSuper ? verifiedSuperPw ?? undefined : undefined);
  }

  function runUpdate(patch: UpdateClientePartial, password?: string) {
    if (!current) return;
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateClienteFields(current.id, patch, password);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setErr(null);
      setSavedOk(true);
      router.refresh();
      setTimeout(() => setSavedOk(false), 2500);
    });
  }

  function handleCheckboxClick(nextValue: boolean) {
    // Abre prompt; só altera o state após senha verificada.
    setCheckboxPrompt({ nextValue, pending: false, error: null });
  }

  function confirmCheckbox(password: string) {
    if (!checkboxPrompt) return;
    setCheckboxPrompt((prev) =>
      prev ? { ...prev, pending: true, error: null } : prev,
    );
    void (async () => {
      const res = await verifySuperPasswordAction(password);
      if (!res.ok) {
        setCheckboxPrompt((prev) =>
          prev ? { ...prev, pending: false, error: res.error } : prev,
        );
        return;
      }
      const next = checkboxPrompt.nextValue;
      setIsSuperadmin(next);
      setVerifiedSuperPw(password);
      setCheckboxPrompt(null);
    })();
  }

  return (
    <>
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={`Cliente #${current.id}`}
      title={current.nome ?? "(sem nome)"}
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            {pendencias.length === 0
              ? "Cadastro completo."
              : `${pendencias.length} pendência${
                  pendencias.length === 1 ? "" : "s"
                }`}
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
            disabled={pending}
            className="chip chip-mint text-[12px] px-3 py-1.5"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </>
      }
    >
      <form id="modal-form" ref={formRef} onSubmit={submit}>
        <div className="px-5 pt-4 pb-2 flex items-center justify-end gap-2">
          <ClientePicker
            clientes={clientes}
            currentId={current.id}
            onPick={(id) => setCurrentId(id)}
          />
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
        {savedOk && (
          <div
            className="px-5 py-2 text-[12px] inline-flex items-center gap-2"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              borderBottom: "1px solid var(--b-base)",
            }}
            role="status"
            aria-live="polite"
          >
            <span aria-hidden style={{ color: "var(--mint-300)" }}>✓</span>
            <span>Informações salvas.</span>
          </div>
        )}

        {isSuper && (
          <div
            className="px-5 pt-3 flex items-center gap-1"
            style={{ borderBottom: "1px solid var(--b-soft)" }}
          >
            <button
              type="button"
              onClick={() => setTab("dados")}
              onMouseEnter={() => setHoverTab("dados")}
              onMouseLeave={() => setHoverTab(null)}
              className="text-[12px] px-3 py-1.5 rounded-t-md inline-flex items-center transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  tab === "dados"
                    ? "var(--ink-3)"
                    : hoverTab === "dados"
                      ? "var(--ink-2)"
                      : "transparent",
                color:
                  tab === "dados" || hoverTab === "dados"
                    ? "var(--fg)"
                    : "var(--fg-muted)",
                borderTop:
                  tab === "dados" || hoverTab === "dados"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderLeft:
                  tab === "dados" || hoverTab === "dados"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderRight:
                  tab === "dados" || hoverTab === "dados"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderBottom:
                  tab === "dados"
                    ? "1px solid var(--ink-3)"
                    : "1px solid transparent",
                marginBottom: "-1px",
              }}
            >
              Dados
            </button>
            <button
              type="button"
              onClick={() => setTab("crm-cols")}
              onMouseEnter={() => setHoverTab("crm-cols")}
              onMouseLeave={() => setHoverTab(null)}
              className="text-[12px] px-3 py-1.5 rounded-t-md inline-flex items-center transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  tab === "crm-cols"
                    ? "var(--ink-3)"
                    : hoverTab === "crm-cols"
                      ? "var(--ink-2)"
                      : "transparent",
                color:
                  tab === "crm-cols" || hoverTab === "crm-cols"
                    ? "var(--fg)"
                    : "var(--fg-muted)",
                borderTop:
                  tab === "crm-cols" || hoverTab === "crm-cols"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderLeft:
                  tab === "crm-cols" || hoverTab === "crm-cols"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderRight:
                  tab === "crm-cols" || hoverTab === "crm-cols"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderBottom:
                  tab === "crm-cols"
                    ? "1px solid var(--ink-3)"
                    : "1px solid transparent",
                marginBottom: "-1px",
              }}
            >
              Colunas do CRM
            </button>
            <button
              type="button"
              onClick={() => setTab("webhooks")}
              onMouseEnter={() => setHoverTab("webhooks")}
              onMouseLeave={() => setHoverTab(null)}
              className="text-[12px] px-3 py-1.5 rounded-t-md inline-flex items-center transition-colors cursor-pointer"
              style={{
                backgroundColor:
                  tab === "webhooks"
                    ? "var(--ink-3)"
                    : hoverTab === "webhooks"
                      ? "var(--ink-2)"
                      : "transparent",
                color:
                  tab === "webhooks" || hoverTab === "webhooks"
                    ? "var(--fg)"
                    : "var(--fg-muted)",
                borderTop:
                  tab === "webhooks" || hoverTab === "webhooks"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderLeft:
                  tab === "webhooks" || hoverTab === "webhooks"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderRight:
                  tab === "webhooks" || hoverTab === "webhooks"
                    ? "1px solid var(--b-soft)"
                    : "1px solid transparent",
                borderBottom:
                  tab === "webhooks"
                    ? "1px solid var(--ink-3)"
                    : "1px solid transparent",
                marginBottom: "-1px",
              }}
            >
              Webhooks
            </button>
          </div>
        )}

        {pendencias.length > 0 && (
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
            <strong className="font-medium">
              {pendencias.length} pendência
              {pendencias.length === 1 ? "" : "s"}:
            </strong>
            <span className="opacity-90">
              {pendencias.map((p) => p.label).join(", ")}
            </span>
          </div>
        )}

        <div
          className="p-5 space-y-4"
          style={{ display: tab === "dados" ? "block" : "none" }}
        >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {FIELDS.filter((f) => !f.superOnly || isSuper).map((f) => {
                const isPendente = pendencias.some(
                  (p) => p.key === (f.key as keyof ClienteRow),
                );
                const value = form[f.key as string] ?? "";
                return (
                  <label
                    key={f.key as string}
                    className={`flex flex-col gap-1 ${f.full ? "sm:col-span-2" : ""}`}
                  >
                    <span className="text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <span style={{ color: "var(--fg-subtle)" }}>
                        {f.label}
                      </span>
                      {isPendente && (
                        <span
                          aria-hidden
                          title="Pendente"
                          className="size-1.5 rounded-full"
                          style={{ backgroundColor: "var(--rose-300)" }}
                        />
                      )}
                    </span>
                    {f.secret ? (
                      <SecretInput
                        value={value}
                        onChange={(v) => set(f.key as string, v)}
                        disabled={pending}
                        highlight={isPendente}
                        forcePassword={f.key === "senha"}
                        placeholder={
                          f.key === "senha"
                            ? "Nova senha (mín. 6) — vazio mantém"
                            : undefined
                        }
                      />
                    ) : (
                      <input
                        type={f.type ?? "text"}
                        value={value}
                        onChange={(e) => set(f.key as string, e.target.value)}
                        disabled={pending}
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
                    )}
                  </label>
                );
              })}

              {isSuper && (
                <>
                  <label className="flex items-center gap-2 sm:col-span-1">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      disabled={pending}
                      className="accent-[color:var(--mint-300)]"
                    />
                    <span className="text-[12.5px] text-[color:var(--fg-muted)]">
                      Cliente ativo
                    </span>
                  </label>
                  <label className="flex items-center gap-2 sm:col-span-1">
                    <input
                      type="checkbox"
                      checked={isSuperadmin}
                      onChange={(e) => {
                        // Não setamos direto — gate de senha primeiro.
                        handleCheckboxClick(e.target.checked);
                      }}
                      disabled={pending}
                      className="accent-[color:var(--mint-300)]"
                    />
                    <span className="text-[12.5px] text-[color:var(--fg-muted)]">
                      Superadmin
                    </span>
                  </label>
                </>
              )}
            </div>

            <div
              className="rounded-md p-3 space-y-2"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="label-eyebrow">Instâncias WhatsApp</div>
                  <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                    Buscar instâncias do tenant deste cliente e aplicar nos
                    campos.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={fetchInstancias}
                  disabled={pendingFetch || pending}
                  className="chip chip-mint text-[12px] px-2.5 py-1"
                  style={{
                    height: "26px",
                    opacity: pendingFetch ? 0.6 : 1,
                  }}
                >
                  {pendingFetch ? "Buscando…" : "↻ Buscar instâncias"}
                </button>
              </div>

              {instErr && (
                <div
                  className="text-[11.5px] px-2 py-1.5 rounded"
                  style={{
                    backgroundColor: "var(--amber-bg)",
                    color: "var(--amber-300)",
                    border: "1px solid var(--amber-border)",
                  }}
                >
                  {instErr}
                </div>
              )}

              {instancias && instancias.length > 0 && (
                <div className="space-y-1.5 max-h-[200px] overflow-y-auto">
                  {instancias.map((inst) => {
                    const picked = pickedInstId === inst.id;
                    return (
                      <div
                        key={inst.id || inst.nome}
                        className="rounded-md px-2.5 py-1.5 flex items-center justify-between gap-2"
                        style={{
                          backgroundColor: picked
                            ? "var(--ink-4)"
                            : "var(--ink-2)",
                          borderLeft: picked
                            ? "2px solid var(--mint-300)"
                            : "2px solid transparent",
                          border: picked
                            ? undefined
                            : "1px solid var(--b-soft)",
                        }}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="text-[12.5px] font-medium truncate"
                              style={{
                                color: picked
                                  ? "var(--mint-200)"
                                  : "var(--fg)",
                              }}
                            >
                              {inst.displayName || inst.nome}
                            </span>
                            <span
                              className="text-[10.5px] numerics whitespace-nowrap"
                              style={{
                                color:
                                  inst.status === "connected"
                                    ? "var(--mint-300)"
                                    : "var(--fg-subtle)",
                              }}
                            >
                              {inst.status ?? "—"}
                            </span>
                          </div>
                          <div className="text-[11px] text-[color:var(--fg-subtle)] flex items-center gap-2 numerics truncate">
                            <span className="truncate">{inst.nome}</span>
                            {inst.telefone && (
                              <span className="whitespace-nowrap">
                                · {inst.telefone}
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => applyInstancia(inst)}
                          className={
                            picked
                              ? "chip chip-mint text-[11.5px] px-2 py-1 whitespace-nowrap"
                              : "text-[11.5px] px-2 py-1 rounded-md whitespace-nowrap transition-colors"
                          }
                          style={
                            picked
                              ? undefined
                              : {
                                  backgroundColor: "var(--ink-3)",
                                  color: "var(--fg-muted)",
                                  border: "1px solid var(--b-soft)",
                                }
                          }
                        >
                          {picked ? "✓ Aplicada" : "Aplicar aos campos"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        {isSuper && (
          <div
            className="p-5 space-y-3"
            style={{ display: tab === "crm-cols" ? "block" : "none" }}
          >
            <div>
              <p className="text-[12.5px] font-medium text-[color:var(--fg)] mb-1">
                Funis e etapas do CRM
              </p>
              <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                Cada slot tem nome (livre) + ID (do CRM) + slug (fixo,
                usado pelo backend). Use "Buscar do CRM" abaixo pra
                preencher automaticamente. Salve junto com os outros
                campos do modal.
              </p>
            </div>
            <CrmStatusSlots
              key={current.id}
              colunas={current.crmStatusColunas ?? null}
              clienteId={current.id}
            />
            <div
              className="rounded-md p-3 text-[11.5px]"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg-muted)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <strong>Estado de origem (CRM Origem):</strong>{" "}
              configurado no campo <code>CRM Origem</code> da aba Dados.
              ID atual:{" "}
              <span style={{ color: "var(--fg)" }}>
                {current.crmOrigemId ?? "(não definido)"}
              </span>
              .
            </div>
          </div>
        )}

        {isSuper && (
          <div
            className="p-5"
            style={{ display: tab === "webhooks" ? "block" : "none" }}
          >
            <WebhooksTab key={current.id} clienteId={current.id} />
          </div>
        )}

      </form>
    </ModalShell>
    <PasswordConfirm
      open={checkboxPrompt !== null}
      title={
        checkboxPrompt?.nextValue
          ? "Ativar superadmin"
          : "Remover superadmin"
      }
      message="Alterar privilégio de superadmin requer a senha do super atual (suporte). Digite-a pra confirmar."
      pending={checkboxPrompt?.pending}
      errorMessage={checkboxPrompt?.error ?? null}
      onConfirm={confirmCheckbox}
      onCancel={() => setCheckboxPrompt(null)}
    />
    </>
  );
}


function ClientePicker({
  clientes,
  currentId,
  onPick,
}: {
  clientes: ClienteRow[];
  currentId: number;
  onPick: (id: number) => void;
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
    const sorted = [...clientes].sort((a, b) =>
      (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", {
        sensitivity: "base",
      }),
    );
    if (!q) return sorted;
    return sorted.filter((c) =>
      [c.nome, c.email, c.crmTenant]
        .map((v) => String(v ?? "").toLowerCase())
        .some((s) => s.includes(q)),
    );
  }, [clientes, q]);

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
        title="Trocar cliente"
      >
        <span aria-hidden className="text-[10px]">⇆</span>
        <span>Trocar cliente</span>
        <span aria-hidden className="text-[9px]">▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1.5 z-30 w-[320px] rounded-md"
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
              placeholder="Buscar cliente por nome, e-mail, tenant..."
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
                Nenhum cliente.
              </div>
            ) : (
              filtered.map((c) => {
                const isCurrent = c.id === currentId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      if (!isCurrent) onPick(c.id);
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
                      {c.nome ?? "(sem nome)"}
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
                      {c.crmTenant ?? "—"}
                      {c.email && <> · {c.email}</>}
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

function WebhooksTab({ clienteId }: { clienteId: number }) {
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState<CrmStatusWithWebhook[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);

  // Webhook global (mensagemRecebidaUrl).
  const [globalUrl, setGlobalUrl] = useState<string>(
    DEFAULT_CRM_WEBHOOK_GLOBAL_URL,
  );
  const [globalPending, startGlobalTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSavedOk, setGlobalSavedOk] = useState(false);

  // Eventos globais (lista de chaves *Url do /configuracaoWebhook).
  const [eventsPending, startEventsTransition] = useTransition();
  const [events, setEvents] = useState<CrmWebhookGlobalEntry[] | null>(null);
  const [eventsError, setEventsError] = useState<string | null>(null);

  function loadEvents() {
    setEventsError(null);
    startEventsTransition(async () => {
      const res = await fetchCrmWebhookGlobalAction(clienteId);
      if (!res.ok) {
        setEventsError(res.error);
        setEvents(null);
        return;
      }
      setEvents(res.entries);
    });
  }

  function saveGlobal() {
    setGlobalError(null);
    setGlobalSavedOk(false);
    const trimmed = globalUrl.trim();
    if (!trimmed) {
      setGlobalError("URL não pode ser vazia.");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setGlobalError("URL inválida.");
      return;
    }
    startGlobalTransition(async () => {
      const res = await setCrmWebhookGlobalAction(clienteId, trimmed);
      if (!res.ok) {
        setGlobalError(res.error);
        return;
      }
      setGlobalSavedOk(true);
      setTimeout(() => setGlobalSavedOk(false), 2500);
    });
  }

  function load() {
    setError(null);
    startTransition(async () => {
      const res = await fetchCrmStatusWithWebhookAction(clienteId);
      if (!res.ok) {
        setError(res.error);
        setItems(null);
        return;
      }
      setItems(res.items);
      setTotal(res.total);
    });
  }

  // UazAPI WhatsApp webhook
  const [uazapiUrl, setUazapiUrl] = useState<string>(GRONER_WEBHOOK_DEFAULT.url);
  const [uazapiPending, startUazapiTransition] = useTransition();
  const [uazapiError, setUazapiError] = useState<string | null>(null);
  const [uazapiSavedOk, setUazapiSavedOk] = useState(false);
  const [uazapiList, setUazapiList] = useState<WhatsappWebhook[] | null>(null);
  const [uazapiListPending, startUazapiListTransition] = useTransition();
  const [uazapiListError, setUazapiListError] = useState<string | null>(null);

  function saveUazapi() {
    setUazapiError(null);
    setUazapiSavedOk(false);
    const trimmed = uazapiUrl.trim();
    if (!trimmed) {
      setUazapiError("URL não pode ser vazia.");
      return;
    }
    try {
      new URL(trimmed);
    } catch {
      setUazapiError("URL inválida.");
      return;
    }
    startUazapiTransition(async () => {
      const res = await setWhatsappWebhookForClienteAction(clienteId, {
        ...GRONER_WEBHOOK_DEFAULT,
        url: trimmed,
      });
      if (!res.ok) {
        setUazapiError(res.error);
        return;
      }
      setUazapiSavedOk(true);
      setTimeout(() => setUazapiSavedOk(false), 2500);
      // Atualiza lista local se já estava carregada
      if (uazapiList !== null) loadUazapiList();
    });
  }

  function loadUazapiList() {
    setUazapiListError(null);
    startUazapiListTransition(async () => {
      const res = await fetchWhatsappWebhooksForClienteAction(clienteId);
      if (!res.ok) {
        setUazapiListError(res.error);
        setUazapiList(null);
        return;
      }
      setUazapiList(res.webhooks);
    });
  }

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  function deleteUazapi(wh: WhatsappWebhook) {
    if (!wh.id) {
      setUazapiListError("Webhook sem ID — não dá pra apagar.");
      return;
    }
    if (
      !window.confirm(
        `Apagar este webhook da instância UazAPI?\n\nURL: ${wh.url}\nID: ${wh.id}`,
      )
    ) {
      return;
    }
    setDeletingId(wh.id);
    void (async () => {
      const res = await deleteWhatsappWebhookForClienteAction(clienteId, wh.id!);
      setDeletingId(null);
      if (!res.ok) {
        setUazapiListError(res.error);
        return;
      }
      loadUazapiList();
    })();
  }
  function toggleUazapiEnabled(wh: WhatsappWebhook) {
    if (!wh.id) {
      setUazapiListError(
        "Webhook sem ID — não dá pra atualizar sem recriar.",
      );
      return;
    }
    setTogglingId(wh.id);
    void (async () => {
      const res = await setWhatsappWebhookForClienteAction(clienteId, {
        ...wh,
        enabled: !wh.enabled,
      });
      setTogglingId(null);
      if (!res.ok) {
        setUazapiListError(res.error);
        return;
      }
      // Recarrega lista pra refletir estado real.
      loadUazapiList();
    })();
  }

  const [removingId, setRemovingId] = useState<string | null>(null);
  function removeItem(statusId: string) {
    if (
      !window.confirm(
        "Apagar o webhook desta coluna? O CRM vai receber valor vazio.",
      )
    ) {
      return;
    }
    setRemovingId(statusId);
    void (async () => {
      const res = await clearCrmStatusWebhookAction(clienteId, statusId);
      setRemovingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Remove local
      setItems((prev) => (prev ? prev.filter((it) => it.id !== statusId) : prev));
    })();
  }

  return (
    <div className="space-y-6">
      {/* Webhook global */}
      <WebhookSection
        title="Webhook global"
        subtitle="Endpoint POST /api/configuracaoWebhook · campo mensagemRecebidaUrl. Define a URL que o CRM dispara quando uma mensagem é recebida (qualquer coluna)."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="url"
            value={globalUrl}
            onChange={(e) => setGlobalUrl(e.target.value)}
            placeholder="https://..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            name="webhook-global-url"
            className="flex-1 min-w-[280px] rounded-md py-1.5 px-3 text-[12.5px] focus:outline-none"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          />
          <button
            type="button"
            onClick={saveGlobal}
            disabled={globalPending}
            className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
          >
            {globalPending ? "Configurando..." : "Configurar"}
          </button>
        </div>
        {globalError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {globalError}
          </div>
        )}
        {globalSavedOk && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-base)",
            }}
          >
            <span style={{ color: "var(--mint-300)" }}>✓</span> Webhook global configurado.
          </div>
        )}
      </WebhookSection>

      {/* Webhook UazAPI (instância WhatsApp) */}
      <WebhookSection
        title="Webhook UazAPI (instância WhatsApp)"
        subtitle="Endpoint POST /webhook da instância UazAPI. Configura events=[messages], excludeMessages=[wasSentByApi, fromMeYes, isGroupYes], enabled=true. Usa apiBaseUrl + apiToken do cliente."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="url"
            value={uazapiUrl}
            onChange={(e) => setUazapiUrl(e.target.value)}
            placeholder="https://..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            data-bwignore="true"
            data-form-type="other"
            name="uazapi-webhook-url"
            className="flex-1 min-w-[280px] rounded-md py-1.5 px-3 text-[12.5px] focus:outline-none"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          />
          <button
            type="button"
            onClick={saveUazapi}
            disabled={uazapiPending}
            className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
          >
            {uazapiPending ? "Configurando..." : "Configurar"}
          </button>
        </div>
        {uazapiError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {uazapiError}
          </div>
        )}
        {uazapiSavedOk && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-base)",
            }}
          >
            <span style={{ color: "var(--mint-300)" }}>✓</span> Webhook UazAPI configurado.
          </div>
        )}
        <div className="pt-1 flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadUazapiList}
            disabled={uazapiListPending}
            className="text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <span aria-hidden>{uazapiListPending ? "…" : "↻"}</span>
            <span>
              {uazapiListPending
                ? "Buscando..."
                : uazapiList === null
                  ? "Listar webhooks atuais"
                  : "Atualizar"}
            </span>
          </button>
          {uazapiList !== null && !uazapiListPending && (
            <span className="text-[11px] text-[color:var(--fg-subtle)] numerics">
              {uazapiList.length} webhook
              {uazapiList.length === 1 ? "" : "s"} ativo
              {uazapiList.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {uazapiListError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {uazapiListError}
          </div>
        )}
        {uazapiList !== null && uazapiList.length === 0 && !uazapiListPending && (
          <div
            className="rounded-md px-3 py-2 text-[12px] text-center italic"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg-subtle)",
              border: "1px dashed var(--b-soft)",
            }}
          >
            Nenhum webhook UazAPI configurado.
          </div>
        )}
        {uazapiList !== null && uazapiList.length > 0 && (
          <ul
            className="rounded-md divide-y"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
            }}
          >
            {uazapiList.map((wh, i) => {
              const busy = !!wh.id && togglingId === wh.id;
              return (
                <li
                  key={wh.id ?? `wh-${i}`}
                  className="px-3 py-2 flex items-start gap-3"
                  style={{ borderBottom: "1px solid var(--b-soft)" }}
                >
                  <div className="flex-1 min-w-0">
                    <p
                      className="text-[11px] mb-0.5 numerics"
                      style={{ color: "var(--mint-300)" }}
                      title={wh.url}
                    >
                      ↪ {wh.url || "(sem url)"}
                    </p>
                    <p className="text-[10.5px] text-[color:var(--fg-subtle)] numerics">
                      id: {wh.id ?? "—"} · events: [
                      {wh.events.join(", ") || "—"}]
                      {wh.excludeMessages &&
                        wh.excludeMessages.length > 0 && (
                          <> · exclude: [{wh.excludeMessages.join(", ")}]</>
                        )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => deleteUazapi(wh)}
                    disabled={!wh.id || deletingId === wh.id}
                    title="Apagar este webhook da instância UazAPI"
                    className="text-[10.5px] px-2 py-1 rounded-md inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--rose-bg)",
                      color: "var(--rose-300)",
                      border: "1px solid var(--rose-border)",
                    }}
                  >
                    <span aria-hidden>✕</span>
                    <span>
                      {deletingId === wh.id ? "Apagando…" : "Apagar"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleUazapiEnabled(wh)}
                    disabled={busy || !wh.id}
                    title={
                      !wh.id
                        ? "Sem ID — não dá pra alternar"
                        : wh.enabled
                          ? "Desativar webhook"
                          : "Ativar webhook"
                    }
                    className="text-[10.5px] px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 shrink-0 disabled:opacity-50"
                    style={{
                      backgroundColor: "var(--ink-3)",
                      color: wh.enabled ? "var(--mint-300)" : "var(--fg-muted)",
                      border: wh.enabled
                        ? "1px solid var(--b-base)"
                        : "1px solid var(--b-soft)",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        position: "relative",
                        display: "inline-block",
                        width: 22,
                        height: 12,
                        borderRadius: 6,
                        backgroundColor: wh.enabled
                          ? "var(--mint-700)"
                          : "rgba(255,255,255,0.10)",
                        border: `1px solid ${
                          wh.enabled
                            ? "var(--mint-600)"
                            : "rgba(255,255,255,0.18)"
                        }`,
                      }}
                    >
                      <span
                        style={{
                          position: "absolute",
                          top: 1,
                          left: wh.enabled ? 11 : 1,
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: wh.enabled
                            ? "var(--mint-100)"
                            : "rgba(255,255,255,0.65)",
                          transition: "left 160ms ease",
                        }}
                      />
                    </span>
                    <span>
                      {busy
                        ? "…"
                        : wh.enabled
                          ? "Ativo"
                          : "Inativo"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </WebhookSection>

      {/* Eventos globais com webhook */}
      <WebhookSection
        title="Eventos globais com webhook"
        subtitle="Lista todos os campos *Url retornados por GET /api/configuracaoWebhook que estão preenchidos. Cada chave é um evento global (ex: mensagem recebida, mensagem enviada)."
      >
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={loadEvents}
            disabled={eventsPending}
            className="text-[12px] px-3 py-1.5 rounded-md inline-flex items-center gap-2 disabled:opacity-50"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <span aria-hidden>{eventsPending ? "…" : "↻"}</span>
            <span>
              {eventsPending
                ? "Buscando..."
                : events === null
                  ? "Listar eventos com webhook"
                  : "Atualizar"}
            </span>
          </button>
          {events !== null && !eventsPending && (
            <span className="text-[11px] text-[color:var(--fg-subtle)] numerics">
              {events.length} evento{events.length === 1 ? "" : "s"}
            </span>
          )}
        </div>
        {eventsError && (
          <div
            className="rounded-md px-2 py-1.5 text-[11.5px]"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            {eventsError}
          </div>
        )}
        {events !== null && events.length === 0 && !eventsPending && !eventsError && (
          <div
            className="rounded-md px-3 py-2 text-[12px] text-center italic"
            style={{
              backgroundColor: "var(--ink-2)",
              color: "var(--fg-subtle)",
              border: "1px dashed var(--b-soft)",
            }}
          >
            Nenhum evento global com webhook configurado.
          </div>
        )}
        {events !== null && events.length > 0 && (
          <ul
            className="rounded-md divide-y"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
            }}
          >
            {events.map((ev) => (
              <li
                key={ev.key}
                className="px-3 py-2 flex items-start gap-3"
                style={{ borderBottom: "1px solid var(--b-soft)" }}
              >
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-medium text-[color:var(--fg)] truncate numerics">
                    {ev.key}
                  </p>
                  <p
                    className="text-[11px] mt-0.5 truncate numerics"
                    style={{ color: "var(--mint-300)" }}
                    title={ev.url}
                  >
                    ↪ {ev.url}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </WebhookSection>

      {/* Colunas com webhook */}
      <WebhookSection
        title="Colunas com webhook"
        subtitle="Lista todas as colunas (status) do CRM deste cliente que têm campo WebhookUrl preenchido. Cada coluna requer um GET individual no CRM, então pode levar alguns segundos."
      >
        <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={load}
          disabled={pending}
          className="chip chip-mint text-[12px] px-3 py-1.5 disabled:opacity-50"
        >
          <span aria-hidden>{pending ? "…" : "↻"}</span>
          <span>
            {pending
              ? "Buscando..."
              : items === null
                ? "Listar colunas com webhook"
                : "Atualizar"}
          </span>
        </button>
        {items !== null && !pending && (
          <span className="text-[11px] text-[color:var(--fg-subtle)] numerics">
            {items.length} de {total} colunas têm webhook
          </span>
        )}
      </div>

      {error && (
        <div
          className="rounded-md px-3 py-2 text-[12px]"
          style={{
            backgroundColor: "var(--rose-bg)",
            color: "var(--rose-300)",
            border: "1px solid var(--rose-border)",
          }}
        >
          {error}
        </div>
      )}

      {items !== null && items.length === 0 && !pending && !error && (
        <div
          className="rounded-md px-3 py-3 text-[12.5px] text-center italic"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-subtle)",
            border: "1px dashed var(--b-soft)",
          }}
        >
          Nenhuma coluna com webhook configurado.
        </div>
      )}

      {items !== null && items.length > 0 && (
        <ul
          className="rounded-md divide-y"
          style={{
            backgroundColor: "var(--ink-3)",
            border: "1px solid var(--b-soft)",
            borderColor: "var(--b-soft)",
          }}
        >
          {items.map((it) => (
            <li
              key={it.id}
              className="px-3 py-2.5 flex items-start gap-3"
              style={{ borderBottom: "1px solid var(--b-soft)" }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-[color:var(--fg)] truncate">
                  {it.nome || <em className="text-[color:var(--fg-subtle)]">sem nome</em>}
                </p>
                <p className="text-[11px] text-[color:var(--fg-subtle)] truncate numerics">
                  #{it.id}
                  {it.etapaNome ? ` · ${it.etapaNome}` : ""}
                </p>
                <p
                  className="text-[11px] mt-1 truncate numerics"
                  style={{ color: "var(--mint-300)" }}
                  title={it.webhookUrl}
                >
                  ↪ {it.webhookUrl}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                disabled={removingId === it.id}
                title="Apagar webhook desta coluna"
                className="text-[11px] px-2 py-1 rounded-md inline-flex items-center gap-1 shrink-0 disabled:opacity-50"
                style={{
                  backgroundColor: "var(--rose-bg)",
                  color: "var(--rose-300)",
                  border: "1px solid var(--rose-border)",
                }}
              >
                <span aria-hidden>✕</span>
                <span>{removingId === it.id ? "Apagando…" : "Apagar"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      </WebhookSection>
    </div>
  );
}

function WebhookSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      {/* Header totalmente apartado — sem container, sem fundo. */}
      <div className="px-1">
        <h1
          className="text-[17px] font-bold tracking-tight"
          style={{ color: "var(--fg)" }}
        >
          {title}
        </h1>
        {subtitle && (
          <p className="text-[11.5px] mt-0.5 text-[color:var(--fg-subtle)] leading-snug">
            {subtitle}
          </p>
        )}
      </div>
      {/* Divisor full-width separando título do conteúdo. */}
      <div
        style={{
          height: 1,
          backgroundColor: "var(--b-base)",
        }}
      />
      {/* Conteúdo num card próprio, separado do header. */}
      <div
        className="rounded-lg p-4 space-y-2"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-soft)",
        }}
      >
        {children}
      </div>
    </section>
  );
}

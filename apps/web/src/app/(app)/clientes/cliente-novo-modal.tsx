"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createCliente, type CreateClienteInput } from "./actions";
import { fetchWhatsappInstanciasByTenantAction } from "@/server/actions/cliente-crm";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import { PasswordConfirm } from "@/components/password-confirm";

type Instancia = {
  id: string;
  nome: string;
  displayName: string;
  telefone: string | null;
  status: string | null;
  baseUrl: string | null;
  token: string | null;
};

type Field = {
  key: keyof CreateClienteInput;
  label: string;
  type?: "text" | "email" | "tel" | "password" | "url";
  placeholder?: string;
  full?: boolean;
};

const FIELDS: Field[] = [
  { key: "nome", label: "Nome *", placeholder: "Razão social ou nome do cliente", full: true },
  { key: "email", label: "E-mail", type: "email", placeholder: "contato@cliente.com.br" },
  { key: "telefone", label: "Telefone", type: "tel", placeholder: "(00) 00000-0000" },
  { key: "senha", label: "Senha", type: "password" },
  { key: "crmTenant", label: "CRM Tenant" },
  { key: "crmOrigemId", label: "CRM Origem" },
  { key: "apiInstanciaNome", label: "Instância (WhatsApp)" },
  { key: "apiBaseUrl", label: "Base URL", type: "url", placeholder: "https://..." },
  { key: "apiToken", label: "API Token", full: true },
  { key: "crmToken", label: "CRM Token", full: true },
];

export function ClienteNovoModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingFetch, startFetch] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [isActive, setIsActive] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [instancias, setInstancias] = useState<Instancia[] | null>(null);
  const [instErr, setInstErr] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [confirmSuper, setConfirmSuper] = useState<{
    payload: CreateClienteInput;
    error: string | null;
  } | null>(null);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open) {
      setForm({});
      setIsActive(true);
      setIsSuperadmin(false);
      setErr(null);
      setInstancias(null);
      setInstErr(null);
      setPickedId(null);
      setConfirmSuper(null);
      window.setTimeout(() => firstInputRef.current?.focus(), 30);
    }
  }, [open]);

  function fetchInstancias() {
    const tenant = (form.crmTenant ?? "").trim();
    if (!tenant) {
      setInstancias(null);
      setPickedId(null);
      setInstErr(
        "Preencha o campo CRM Tenant antes de buscar as instâncias.",
      );
      return;
    }
    setInstErr(null);
    startFetch(async () => {
      const res = await fetchWhatsappInstanciasByTenantAction(tenant);
      if (!res.ok) {
        setInstErr(res.error);
        setInstancias(null);
        return;
      }
      setInstancias(res.instancias);
      if (res.instancias.length === 0) {
        setInstErr("Nenhuma instância encontrada pra esse tenant.");
      }
    });
  }

  function pickInstancia(inst: Instancia) {
    setPickedId(inst.id);
    setForm((prev) => ({
      ...prev,
      apiInstanciaNome: inst.nome,
      apiBaseUrl: inst.baseUrl ?? prev.apiBaseUrl ?? "",
      apiToken: inst.token ?? prev.apiToken ?? "",
    }));
  }

  const isDirty = useDirtyForm(
    { form: {}, isActive: true, isSuperadmin: false },
    { form, isActive, isSuperadmin },
  );

  if (!open) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const payload: CreateClienteInput = {
      nome: form.nome ?? "",
      email: form.email,
      telefone: form.telefone,
      senha: form.senha,
      crmTenant: form.crmTenant,
      crmOrigemId: form.crmOrigemId,
      apiInstanciaNome: form.apiInstanciaNome,
      apiBaseUrl: form.apiBaseUrl,
      apiToken: form.apiToken,
      crmToken: form.crmToken,
      isActive,
      isSuperadmin,
    };
    if (isSuperadmin) {
      setConfirmSuper({ payload, error: null });
      return;
    }
    runCreate(payload);
  }

  function runCreate(payload: CreateClienteInput, password?: string) {
    startTransition(async () => {
      const res = await createCliente(payload, password);
      if (!res.ok) {
        if (
          confirmSuper &&
          payload.isSuperadmin
        ) {
          setConfirmSuper({ payload, error: res.error });
        } else {
          setErr(res.error);
        }
        return;
      }
      setConfirmSuper(null);
      onClose();
      router.refresh();
    });
  }

  return (
    <>
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Novo"
      title="Cadastro de cliente"
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            Lojas e vendedores são criados vazios — adicione no Cadastro depois.
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
            {pending ? "Criando…" : "Criar cliente"}
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
          {FIELDS.map((f, i) => (
            <label
              key={f.key as string}
              className={`flex flex-col gap-1 ${f.full ? "sm:col-span-2" : ""}`}
            >
              <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
                {f.label}
              </span>
              <input
                ref={i === 0 ? firstInputRef : undefined}
                type={f.type ?? "text"}
                value={form[f.key as string] ?? ""}
                onChange={(e) => set(f.key as string, e.target.value)}
                placeholder={f.placeholder}
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
          ))}

          <div
            className="sm:col-span-2 rounded-md p-3 space-y-2"
            style={{
              backgroundColor: "var(--ink-3)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <div className="label-eyebrow">Instâncias WhatsApp</div>
                <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                  Preencha o CRM Tenant e clique para buscar as instâncias disponíveis.
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
                  const picked = pickedId === inst.id;
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
                        onClick={() => pickInstancia(inst)}
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

            {pickedId && (
              <div
                className="text-[11px]"
                style={{ color: "var(--mint-300)" }}
              >
                ✓ Instância selecionada — campos preenchidos automaticamente
                (instância, base URL, API token).
              </div>
            )}
          </div>

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
              onChange={(e) => setIsSuperadmin(e.target.checked)}
              disabled={pending}
              className="accent-[color:var(--mint-300)]"
            />
            <span className="text-[12.5px] text-[color:var(--fg-muted)]">
              Superadmin
            </span>
          </label>
        </div>

      </form>
    </ModalShell>
    <PasswordConfirm
      open={confirmSuper !== null}
      title="Criar cliente como superadmin"
      message="Criar um cliente com privilégio de superadmin requer a senha do super atual (suporte). Digite-a pra confirmar."
      pending={pending}
      errorMessage={confirmSuper?.error ?? null}
      onConfirm={(pw) => {
        if (confirmSuper) runCreate(confirmSuper.payload, pw);
      }}
      onCancel={() => setConfirmSuper(null)}
    />
    </>
  );
}

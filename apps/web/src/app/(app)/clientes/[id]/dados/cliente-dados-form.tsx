"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateClienteFields,
  verifySuperPasswordAction,
  type UpdateClientePartial,
} from "../../actions";
import { fetchWhatsappInstanciasForClienteAction } from "@/server/actions/cliente-crm";
import type { ClienteRow } from "../../clientes-table";
import { pendenciasFor, type CriticalField } from "../../saude";
import { PasswordConfirm } from "@/components/password-confirm";
import { SecretInput } from "@/components/data-table";

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
  { key: "apiBaseUrl", label: "Base URL API", secret: true },
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

/**
 * Form de edição "Dados" do cliente — extraído de cliente-edit-modal.tsx
 * (linhas ~555-770). Apresenta inputs canonicals, instâncias picker e
 * gate de password pra alternar `isSuperadmin`.
 *
 * Usa server action `updateClienteFields` (mesma usada pelo modal). No
 * sucesso chama `router.refresh()` — o `revalidatePath("/clientes")`
 * server-side cuida de invalidar a lista; cache do layout `[id]` é
 * preservado entre navegações entre tabs.
 */
export function ClienteDadosForm({
  cliente,
  isSuper,
}: {
  cliente: ClienteRow;
  isSuper: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingFetch, startFetch] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);

  const [form, setForm] = useState<Record<string, string>>(() => ({
    nome: cliente.nome ?? "",
    email: cliente.email ?? "",
    telefone: cliente.telefone ?? "",
    senha: "",
    crmTenant: cliente.crmTenant ?? "",
    crmOrigemId: cliente.crmOrigemId ?? "",
    apiInstanciaNome: cliente.apiInstanciaNome ?? "",
    apiBaseUrl: cliente.apiBaseUrl ?? "",
    apiToken: cliente.apiToken ?? "",
    crmToken: cliente.crmToken ?? "",
  }));
  const [isActive, setIsActive] = useState<boolean>(cliente.isActive ?? true);
  const [isSuperadmin, setIsSuperadmin] = useState<boolean>(
    cliente.isSuperadmin ?? false,
  );

  const [instancias, setInstancias] = useState<Instancia[] | null>(null);
  const [instErr, setInstErr] = useState<string | null>(null);
  const [pickedInstId, setPickedInstId] = useState<string | null>(null);

  const formRef = useRef<HTMLFormElement>(null);

  // Senha confirmada quando muda checkbox isSuperadmin.
  const [verifiedSuperPw, setVerifiedSuperPw] = useState<string | null>(null);
  const [checkboxPrompt, setCheckboxPrompt] = useState<{
    nextValue: boolean;
    pending: boolean;
    error: string | null;
  } | null>(null);

  // Re-sincroniza form quando o cliente prop muda (ex: navegação entre
  // /clientes/A/dados → /clientes/B/dados sem unmount completo).
  useEffect(() => {
    setForm({
      nome: cliente.nome ?? "",
      email: cliente.email ?? "",
      telefone: cliente.telefone ?? "",
      senha: "",
      crmTenant: cliente.crmTenant ?? "",
      crmOrigemId: cliente.crmOrigemId ?? "",
      apiInstanciaNome: cliente.apiInstanciaNome ?? "",
      apiBaseUrl: cliente.apiBaseUrl ?? "",
      apiToken: cliente.apiToken ?? "",
      crmToken: cliente.crmToken ?? "",
    });
    setIsActive(cliente.isActive ?? true);
    setIsSuperadmin(cliente.isSuperadmin ?? false);
    setInstancias(null);
    setInstErr(null);
    setPickedInstId(null);
    setErr(null);
    setSavedOk(false);
    setVerifiedSuperPw(null);
    setCheckboxPrompt(null);
  }, [cliente.id]);

  const pendencias = useMemo<CriticalField[]>(
    () => pendenciasFor(cliente, { isSuper }),
    [cliente, isSuper],
  );

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  function fetchInstancias() {
    setInstErr(null);
    startFetch(async () => {
      const res = await fetchWhatsappInstanciasForClienteAction(cliente.id);
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

  function buildPatch(): UpdateClientePartial {
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
      if (isSuperadmin !== (cliente.isSuperadmin ?? false)) {
        patch.isSuperadmin = isSuperadmin;
      }
    }
    return patch;
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const patch = buildPatch();
    const touchesSuper = Object.prototype.hasOwnProperty.call(
      patch,
      "isSuperadmin",
    );
    if (touchesSuper && !verifiedSuperPw) {
      setErr(
        "Confirme a senha do superadmin marcando/desmarcando o checkbox novamente.",
      );
      return;
    }
    runUpdate(patch, touchesSuper ? verifiedSuperPw ?? undefined : undefined);
  }

  function runUpdate(patch: UpdateClientePartial, password?: string) {
    setSavedOk(false);
    startTransition(async () => {
      const res = await updateClienteFields(cliente.id, patch, password);
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
    <form ref={formRef} onSubmit={submit} className="p-5 space-y-4">
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
          <span>Informações salvas.</span>
        </div>
      )}

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
              {f.secret ? (
                <SecretInput
                  value={value}
                  onChange={(v) => set(f.key as string, v)}
                  disabled={pending || !isSuper}
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
                  disabled={pending || !isSuper}
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
                onChange={(e) => handleCheckboxClick(e.target.checked)}
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

      {isSuper && (
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
              Buscar instâncias do tenant deste cliente e aplicar nos campos.
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
                          color: picked ? "var(--mint-200)" : "var(--fg)",
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
      )}

      <div
        className="flex items-center justify-between gap-2 pt-1"
        style={{ borderTop: "1px solid var(--b-soft)", paddingTop: "12px" }}
      >
        <span className="text-[11px] text-[color:var(--fg-subtle)]">
          {pendencias.length === 0
            ? "Cadastro completo."
            : `${pendencias.length} pendência${pendencias.length === 1 ? "" : "s"}`}
        </span>
        {isSuper && (
          <button
            type="submit"
            disabled={pending}
            className="chip chip-mint text-[12px] px-3 py-1.5"
          >
            {pending ? "Salvando…" : "Salvar"}
          </button>
        )}
      </div>

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
    </form>
  );
}

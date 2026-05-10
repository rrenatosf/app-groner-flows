"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SearchableSelect } from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import { createVendedorTyped, type CreateVendedorInput } from "./actions";
import type { UsuarioRow } from "./usuarios-table";

export function UsuarioNovoModal({
  open,
  rows,
  isSuper,
  forcedClienteId,
  forcedClienteNome,
  forcedLojasDoCliente,
  forcedLojaIdsPreSelected,
  onClose,
}: {
  open: boolean;
  rows: UsuarioRow[];
  isSuper: boolean;
  /** Quando vier preenchido, modal trava nesse cliente (drilldown).
   *  Independe de `rows` — funciona mesmo com lista vazia. */
  forcedClienteId?: number;
  forcedClienteNome?: string;
  forcedLojasDoCliente?: { id: string; nome: string }[];
  /** Drilldown loja: pré-marca essas lojas no checklist (não trava). */
  forcedLojaIdsPreSelected?: string[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [lojaIds, setLojaIds] = useState<string[]>([]);
  const [role, setRole] = useState<"owner" | "vendedor">("vendedor");
  const formRef = useRef<HTMLFormElement>(null);

  // Lista de clientes únicos derivada das rows. Quando forcedClienteId
  // vem preenchido (modo drilldown), garante que ele esteja na lista
  // mesmo se rows estiver vazio (cliente sem usuários ainda).
  const clientes = useMemo(() => {
    const seen = new Map<
      number,
      {
        id: number;
        nome: string;
        lojas: { id: string; nome: string }[];
      }
    >();
    if (forcedClienteId !== undefined) {
      seen.set(forcedClienteId, {
        id: forcedClienteId,
        nome: forcedClienteNome ?? `Cliente #${forcedClienteId}`,
        lojas: forcedLojasDoCliente ?? [],
      });
    }
    for (const r of rows) {
      if (!seen.has(r.clienteId)) {
        seen.set(r.clienteId, {
          id: r.clienteId,
          nome: r.clienteNome ?? r.clienteTenant ?? `Cliente #${r.clienteId}`,
          lojas: r.lojasDoCliente,
        });
      }
    }
    return Array.from(seen.values()).sort((a, b) =>
      a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" }),
    );
  }, [rows, forcedClienteId, forcedClienteNome, forcedLojasDoCliente]);

  const lojasDisponiveis = useMemo(() => {
    if (clienteId === null) return [];
    const fromClientes = clientes.find((c) => c.id === clienteId)?.lojas ?? [];
    if (fromClientes.length > 0) return fromClientes;
    // Fallback: quando rows não traz lojas pro cliente forçado, usa
    // a lista explícita do drilldown.
    if (
      forcedClienteId !== undefined &&
      clienteId === forcedClienteId &&
      forcedLojasDoCliente
    ) {
      return forcedLojasDoCliente;
    }
    return fromClientes;
  }, [clienteId, clientes, forcedClienteId, forcedLojasDoCliente]);

  // Reset do form/state quando modal abre. Deps fixas: só `open`.
  useEffect(() => {
    if (!open) return;
    setForm({});
    setErr(null);
    setRole("vendedor");
    setLojaIds(forcedLojaIdsPreSelected ?? []);
  }, [open, forcedLojaIdsPreSelected]);

  // Auto-seleção de clienteId. Deps separadas pra evitar mismatch
  // de tamanho do array entre HMR ticks.
  useEffect(() => {
    if (!open) return;
    if (forcedClienteId !== undefined) {
      setClienteId(forcedClienteId);
    } else {
      setClienteId(clientes.length === 1 ? clientes[0].id : null);
    }
  }, [open, clientes, forcedClienteId]);

  const isDirty = useDirtyForm(
    { form: {}, role: "vendedor" as "owner" | "vendedor", lojaIds: forcedLojaIdsPreSelected ?? [] },
    { form, role, lojaIds },
  );

  if (!open) return null;

  function set(k: string, v: string) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }
  function toggleLoja(id: string) {
    setLojaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (clienteId === null) {
      setErr("Selecione o cliente.");
      return;
    }
    const input: CreateVendedorInput = {
      nome: form.nome ?? "",
      email: form.email ?? "",
      telefone: form.telefone || null,
      senha: form.senha ?? "",
      role,
      loja_ids: lojaIds,
      crm_id: form.crm_id || null,
    };
    startTransition(async () => {
      const res = await createVendedorTyped(clienteId, input);
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
      eyebrow="Novo"
      title="Cadastro de usuário"
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
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
            {pending ? "Criando…" : "Criar usuário"}
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
                items={clientes.map((c) => ({ id: c.id, nome: c.nome }))}
                value={clienteId}
                onChange={(k) => {
                  setClienteId(k);
                  // Preserva pré-seleção forçada quando user troca cliente
                  // (improvável no drilldown, mas defensivo pra futuro).
                  setLojaIds(forcedLojaIdsPreSelected ?? []);
                }}
                getKey={(c) => c.id}
                getLabel={(c) => c.nome}
                placeholder="Selecione o cliente"
                searchPlaceholder="Buscar cliente..."
                required
                disabled={pending}
                width={400}
              />
            </label>
          )}

          <Field
            name="nome"
            label="Nome *"
            full
            form={form}
            set={set}
            pending={pending}
            required
          />
          <Field
            name="email"
            label="E-mail *"
            type="email"
            form={form}
            set={set}
            pending={pending}
            required
          />
          <Field
            name="telefone"
            label="Telefone"
            type="tel"
            form={form}
            set={set}
            pending={pending}
          />
          <Field
            name="senha"
            label="Senha * (mín. 6)"
            type="password"
            form={form}
            set={set}
            pending={pending}
            required
          />
          <Field
            name="crm_id"
            label="CRM ID"
            form={form}
            set={set}
            pending={pending}
          />

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Função
            </span>
            <select
              value={role}
              onChange={(e) =>
                setRole(e.target.value === "owner" ? "owner" : "vendedor")
              }
              disabled={pending}
              className="text-[13px] px-2.5 py-1.5 rounded-md"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
                color: "var(--fg)",
                outline: "none",
              }}
            >
              <option value="vendedor">Usuário</option>
              <option value="owner">Admin do tenant</option>
            </select>
          </label>

          <div className="sm:col-span-2">
            <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
              Lojas vinculadas
            </span>
            {clienteId === null ? (
              <p className="text-[11.5px] text-[color:var(--fg-subtle)] mt-2">
                Selecione o cliente acima primeiro.
              </p>
            ) : lojasDisponiveis.length === 0 ? (
              <p className="text-[11.5px] text-[color:var(--fg-subtle)] mt-2">
                Esse cliente não tem lojas cadastradas. Cadastre lojas
                antes pra vincular o usuário.
              </p>
            ) : (
              <div
                className="mt-1 rounded-md p-2 space-y-1 max-h-[160px] overflow-y-auto"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: "1px solid var(--b-soft)",
                }}
              >
                {lojasDisponiveis.map((l) => {
                  const isPicked = lojaIds.includes(l.id);
                  return (
                    <label
                      key={l.id}
                      className="flex items-center gap-2 px-1.5 py-0.5 rounded cursor-pointer hover:bg-[color:var(--ink-2)]"
                    >
                      <input
                        type="checkbox"
                        checked={isPicked}
                        onChange={() => toggleLoja(l.id)}
                        disabled={pending}
                        className="accent-[color:var(--mint-300)]"
                      />
                      <span
                        className="text-[12.5px]"
                        style={{
                          color: isPicked ? "var(--mint-200)" : "var(--fg)",
                        }}
                      >
                        {l.nome}
                      </span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>

      </form>
    </ModalShell>
  );
}

function Field({
  name,
  label,
  type = "text",
  full,
  required,
  form,
  set,
  pending,
}: {
  name: string;
  label: string;
  type?: "text" | "email" | "tel" | "password";
  full?: boolean;
  required?: boolean;
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
        required={required}
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
  );
}

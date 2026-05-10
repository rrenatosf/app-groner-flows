"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SecretInput } from "@/components/data-table";
import type { Vendedor } from "@/lib/db/schema";
import {
  applyVendedorCanonicalShape,
  deleteVendedor,
  updateVendedorFields,
  type UpdateVendedorPartial,
} from "../../../../../usuarios/actions";
import {
  pendenciasFor,
  vendedorShapeIssues,
} from "../../../../../usuarios/saude-usuario";

/**
 * Form da aba "Dados" do vendedor — extraído de usuario-edit-modal.tsx.
 * Lógica de save idêntica (updateVendedorFields). Aba de Horários é
 * uma sub-rota separada.
 */
export function VendedorDadosForm({
  clienteId,
  vendedor,
  lojasDoCliente,
  canEdit,
}: {
  clienteId: number;
  vendedor: Vendedor;
  lojasDoCliente: { id: string; nome: string }[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);
  const [form, setForm] = useState<Record<string, string>>({
    nome: vendedor.nome ?? "",
    email: vendedor.email ?? "",
    telefone: vendedor.telefone ?? "",
    senha: "",
    crm_id: vendedor.crm_id ?? "",
  });
  const [role, setRole] = useState<"owner" | "vendedor">(vendedor.role);
  const [isActive, setIsActive] = useState<boolean>(vendedor.is_active);
  const [recebeAgendamento, setRecebeAgendamento] = useState<boolean>(
    vendedor.recebe_agendamento,
  );
  const [lojaIds, setLojaIds] = useState<string[]>(
    Array.isArray(vendedor.loja_ids) ? [...vendedor.loja_ids] : [],
  );

  useEffect(() => {
    setForm({
      nome: vendedor.nome ?? "",
      email: vendedor.email ?? "",
      telefone: vendedor.telefone ?? "",
      senha: "",
      crm_id: vendedor.crm_id ?? "",
    });
    setRole(vendedor.role);
    setIsActive(vendedor.is_active);
    setRecebeAgendamento(vendedor.recebe_agendamento);
    setLojaIds(Array.isArray(vendedor.loja_ids) ? [...vendedor.loja_ids] : []);
    setErr(null);
    setSavedOk(false);
  }, [vendedor.uid]);

  const pendencias = useMemo(() => pendenciasFor(vendedor), [vendedor]);
  const drift = useMemo(
    () =>
      vendedorShapeIssues(vendedor as unknown as Record<string, unknown>),
    [vendedor],
  );

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
    setSavedOk(false);
    const patch: UpdateVendedorPartial = {
      nome: form.nome ?? null,
      email: form.email ?? null,
      telefone: form.telefone ?? null,
      crm_id: form.crm_id ?? null,
      role,
      is_active: isActive,
      recebe_agendamento: recebeAgendamento,
      loja_ids: lojaIds,
      // Horários NÃO são alterados aqui — a aba "Horários" tem o próprio
      // submit. Não enviamos pra evitar overwrite.
      horarios: vendedor.horarios ?? {},
    };
    if ((form.senha ?? "").trim() !== "") patch.senha = form.senha;

    startTransition(async () => {
      const res = await updateVendedorFields(clienteId, vendedor.uid, patch);
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
    if (
      !window.confirm(`Remover o usuário "${vendedor.nome ?? "(sem nome)"}"?`)
    )
      return;
    startTransition(async () => {
      const res = await deleteVendedor(clienteId, vendedor.uid);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.push(`/clientes/${clienteId}/vendedores`);
      router.refresh();
    });
  }

  function handleApplyShape() {
    startTransition(async () => {
      const res = await applyVendedorCanonicalShape(clienteId, vendedor.uid);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="p-5 space-y-4">
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
          <span>Vendedor salvo.</span>
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
          <strong>Shape divergente:</strong> {drift.length} item(s).
          {canEdit && (
            <button
              type="button"
              onClick={handleApplyShape}
              disabled={pending}
              className="ml-2 underline"
            >
              Aplicar shape canônico
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <FieldText
          name="nome"
          label="Nome"
          full
          form={form}
          set={set}
          pending={pending || !canEdit}
        />
        <FieldText
          name="email"
          label="E-mail"
          type="email"
          form={form}
          set={set}
          pending={pending || !canEdit}
        />
        <FieldText
          name="telefone"
          label="Telefone"
          type="tel"
          form={form}
          set={set}
          pending={pending || !canEdit}
        />
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
            Senha (vazio mantém)
          </span>
          <SecretInput
            value={form.senha ?? ""}
            onChange={(v) => set("senha", v)}
            disabled={pending || !canEdit}
            forcePassword
            placeholder="Nova senha (mín. 6) — vazio mantém"
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
            Função
          </span>
          <select
            value={role}
            onChange={(e) =>
              setRole(e.target.value === "owner" ? "owner" : "vendedor")
            }
            disabled={pending || !canEdit}
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

        <FieldText
          name="crm_id"
          label="CRM ID"
          form={form}
          set={set}
          pending={pending || !canEdit}
        />

        <label className="flex items-center gap-2 sm:col-span-1">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            disabled={pending || !canEdit}
            className="accent-[color:var(--mint-300)]"
          />
          <span className="text-[12.5px] text-[color:var(--fg-muted)]">
            Usuário ativo
          </span>
        </label>
        <label className="flex items-center gap-2 sm:col-span-1">
          <input
            type="checkbox"
            checked={recebeAgendamento}
            onChange={(e) => setRecebeAgendamento(e.target.checked)}
            disabled={pending || !canEdit}
            className="accent-[color:var(--mint-300)]"
          />
          <span className="text-[12.5px] text-[color:var(--fg-muted)]">
            Recebe agendamentos
          </span>
        </label>

        <div className="sm:col-span-2">
          <span className="text-[11px] uppercase tracking-wider text-[color:var(--fg-subtle)]">
            Lojas vinculadas
          </span>
          <div
            className="mt-1 rounded-md p-2 space-y-1 max-h-[180px] overflow-y-auto"
            style={{
              backgroundColor: "var(--ink-3)",
              border: "1px solid var(--b-soft)",
            }}
          >
            {lojasDoCliente.length === 0 ? (
              <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                Esse cliente não tem lojas cadastradas.
              </p>
            ) : (
              lojasDoCliente.map((l) => {
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
                      disabled={pending || !canEdit}
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
              })
            )}
          </div>
        </div>
      </div>

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
              Remover
            </button>
          )}
          {canEdit && (
            <button
              type="submit"
              disabled={pending}
              className="chip chip-mint text-[12px] px-3 py-1.5"
            >
              {pending ? "Salvando…" : "Salvar"}
            </button>
          )}
        </div>
      </div>
    </form>
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
  type?: "text" | "email" | "tel";
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

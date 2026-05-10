"use client";

/**
 * @deprecated Substituído pelo drilldown em rota
 * `/clientes/[id]/vendedores/[vendedorUid]/(dados|horarios|leads)`.
 * Mantido por enquanto pra suportar HealthBadge legado e edição
 * inline de células. Não adicionar novas funcionalidades aqui — o
 * form principal vive em
 * `clientes/[id]/vendedores/[vendedorUid]/dados/vendedor-dados-form.tsx`
 * e horários em `.../horarios/horarios-form.tsx`.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SecretInput } from "@/components/data-table";
import { ModalShell } from "@/components/modal-shell";
import { useDirtyForm } from "@/components/use-dirty-form";
import type { HorariosVendedor } from "@/lib/db/schema";
import {
  applyVendedorCanonicalShape,
  deleteVendedor,
  updateVendedorFields,
  type UpdateVendedorPartial,
} from "./actions";
import type { UsuarioRow } from "./usuarios-table";
import {
  pendenciasFor,
  vendedorShapeIssues,
} from "./saude-usuario";
import { UsuarioHorariosGrid } from "./usuario-horarios-grid";

type Tab = "info" | "horarios";

export function UsuarioEditModal({
  open,
  target,
  rows,
  isSuper,
  canEdit,
  onClose,
}: {
  open: boolean;
  target: UsuarioRow | null;
  rows: UsuarioRow[];
  isSuper: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("info");
  const [form, setForm] = useState<Record<string, string>>({});
  const [role, setRole] = useState<"owner" | "vendedor">("vendedor");
  const [isActive, setIsActive] = useState(true);
  const [recebeAgendamento, setRecebeAgendamento] = useState(true);
  const [lojaIds, setLojaIds] = useState<string[]>([]);
  const [horarios, setHorarios] = useState<HorariosVendedor>({});
  const [initial, setInitial] = useState<{
    form: Record<string, string>;
    role: "owner" | "vendedor";
    isActive: boolean;
    recebeAgendamento: boolean;
    lojaIds: string[];
    horarios: HorariosVendedor;
  }>({
    form: {},
    role: "vendedor",
    isActive: true,
    recebeAgendamento: true,
    lojaIds: [],
    horarios: {},
  });
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (open && target) {
      const v = target.vendedor;
      setTab("info");
      setErr(null);
      const nextForm = {
        nome: v.nome ?? "",
        email: v.email ?? "",
        telefone: v.telefone ?? "",
        senha: "",
        crm_id: v.crm_id ?? "",
      };
      const nextLojas = Array.isArray(v.loja_ids) ? [...v.loja_ids] : [];
      const nextHorarios =
        v.horarios && typeof v.horarios === "object" ? { ...v.horarios } : {};
      setForm(nextForm);
      setRole(v.role);
      setIsActive(v.is_active);
      setRecebeAgendamento(v.recebe_agendamento);
      setLojaIds(nextLojas);
      setHorarios(nextHorarios);
      setInitial({
        form: nextForm,
        role: v.role,
        isActive: v.is_active,
        recebeAgendamento: v.recebe_agendamento,
        lojaIds: nextLojas,
        horarios: nextHorarios,
      });
    }
  }, [open, target]);

  const isDirty = useDirtyForm(
    initial,
    { form, role, isActive, recebeAgendamento, lojaIds, horarios },
  );

  const pendencias = useMemo(
    () => (target ? pendenciasFor(target.vendedor) : []),
    [target],
  );
  const drift = useMemo(
    () =>
      target
        ? vendedorShapeIssues(
            target.vendedor as unknown as Record<string, unknown>,
          )
        : [],
    [target],
  );

  if (!open || !target) return null;

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
    if (!target) return;
    setErr(null);

    // Validação: recebe_agendamento exige pelo menos 1 intervalo cadastrado.
    if (recebeAgendamento) {
      const temIntervalo = Object.values(horarios ?? {}).some(
        (arr) => Array.isArray(arr) && arr.length > 0,
      );
      if (!temIntervalo) {
        setErr(
          'Configure ao menos 1 horário antes de marcar "Recebe agendamentos".',
        );
        return;
      }
    }

    const patch: UpdateVendedorPartial = {
      nome: form.nome ?? null,
      email: form.email ?? null,
      telefone: form.telefone ?? null,
      crm_id: form.crm_id ?? null,
      role,
      is_active: isActive,
      recebe_agendamento: recebeAgendamento,
      loja_ids: lojaIds,
      horarios,
    };
    if ((form.senha ?? "").trim() !== "") patch.senha = form.senha;

    startTransition(async () => {
      const res = await updateVendedorFields(
        target.clienteId,
        target.vendedor.uid,
        patch,
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleDelete() {
    if (!target) return;
    if (
      !confirm(
        `Remover o usuário "${target.vendedor.nome ?? "(sem nome)"}"?`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteVendedor(
        target.clienteId,
        target.vendedor.uid,
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  function handleApplyShape() {
    if (!target) return;
    startTransition(async () => {
      const res = await applyVendedorCanonicalShape(
        target.clienteId,
        target.vendedor.uid,
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow={`Usuário${isSuper ? ` · ${target.clienteNome ?? "—"}` : ""}`}
      title={target.vendedor.nome ?? "(sem nome)"}
      size="full"
      isDirty={isDirty}
      onSubmit={() => formRef.current?.requestSubmit()}
      footer={
        <>
          <span className="text-[11px] text-[color:var(--fg-subtle)] mr-auto">
            uid: {target.vendedor.uid.slice(0, 8)}…
          </span>
          {canEdit && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={pending}
              className="btn-danger"
            >
              Remover
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
          <TabButton active={tab === "info"} onClick={() => setTab("info")}>
            Informações
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
            active={tab === "horarios"}
            onClick={() => setTab("horarios")}
          >
            Horários
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

        {drift.length > 0 && (
          <div
            className="mx-5 mt-4 px-3 py-2 rounded-md text-[12px] flex items-center gap-2 flex-wrap"
            style={{
              backgroundColor: "var(--rose-bg)",
              color: "var(--rose-300)",
              border: "1px solid var(--rose-border)",
            }}
          >
            <span>
              <strong className="font-medium">
                Shape divergente:
              </strong>{" "}
              {drift.length} item(s).
              {canEdit && (
                <button
                  type="button"
                  onClick={handleApplyShape}
                  disabled={pending}
                  className="ml-2 underline hover:text-[color:var(--mint-300)]"
                >
                  Aplicar shape canônico
                </button>
              )}
            </span>
          </div>
        )}

        {tab === "info" && (
          <div className="p-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  setRole(
                    e.target.value === "owner" ? "owner" : "vendedor",
                  )
                }
                disabled={pending || !canEdit}
                className="input-edit"
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
                onChange={(e) =>
                  setRecebeAgendamento(e.target.checked)
                }
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
                className="mt-1 rounded-md p-2 space-y-1 max-h-[160px] overflow-y-auto"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: "1px solid var(--b-soft)",
                }}
              >
                {target.lojasDoCliente.length === 0 ? (
                  <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
                    Esse cliente não tem lojas cadastradas.
                  </p>
                ) : (
                  target.lojasDoCliente.map((l) => {
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
                            color: isPicked
                              ? "var(--mint-200)"
                              : "var(--fg)",
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
        )}

        {tab === "horarios" && (
          <div className="p-5">
            <UsuarioHorariosGrid
              value={horarios}
              onChange={setHorarios}
              disabled={pending || !canEdit}
            />
          </div>
        )}

      </form>
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
        border: active
          ? "1px solid var(--b-soft)"
          : "1px solid transparent",
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
        className="input-edit"
      />
    </label>
  );
}

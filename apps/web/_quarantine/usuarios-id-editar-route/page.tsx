import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes, type Vendedor } from "@/lib/db/schema";
import { findVendedorById } from "@/server/services/usuarios";
import { readSession } from "@/lib/auth/session";
import { isOwner, isSuperadminFresh } from "@/lib/auth/guard";
import { PageHeader } from "@/components/page-header";
import { Field, Toggle } from "@/components/form-field";
import { SaveButton } from "@/components/save-button";
import { saveUsuarioAction } from "./actions";
import { HorariosGrid } from "./horarios-grid";
import type { HorariosVendedor } from "@/lib/db/schema";

export default async function EditUsuarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  if (!isOwner(session)) redirect("/usuarios");

  const { id } = await params;
  const usuarioId = Number(id);
  if (!Number.isFinite(usuarioId)) notFound();

  // Superadmin pode editar vendedor de qualquer tenant — varre todos os
  // clientes procurando o id. Cliente comum só do próprio.
  let targetClienteId = session.clienteId;
  let tenantLabel: string | null = null;
  if (await isSuperadminFresh(session)) {
    const all = await db
      .select({
        id: clientes.id,
        nome: clientes.nome,
        crmTenant: clientes.crmTenant,
        vendedores: clientes.vendedores,
      })
      .from(clientes);
    const owner = all.find((c) => {
      const list = Array.isArray(c.vendedores)
        ? (c.vendedores as Vendedor[])
        : [];
      return list.some((v) => v.id === usuarioId);
    });
    if (owner && owner.id !== session.clienteId) {
      targetClienteId = owner.id;
      tenantLabel =
        owner.nome ?? owner.crmTenant ?? `Cliente #${owner.id}`;
    }
  }

  const v = await findVendedorById(targetClienteId, usuarioId);
  if (!v) notFound();
  const u = {
    nome: v.nome,
    email: v.email,
    telefone: v.telefone,
    crmId: v.crm_id,
    isActive: v.is_active,
    role: v.role,
  };
  const horariosInicial: HorariosVendedor = v.horarios ?? {};

  const action = saveUsuarioAction.bind(null, usuarioId);

  return (
    <>
      <PageHeader
        eyebrow={tenantLabel ? `Tenant · ${tenantLabel}` : undefined}
        title={`Editar usuário · ${u.nome ?? u.email ?? `#${usuarioId}`}`}
        subtitle="Apenas o dono da loja pode editar usuários."
        actions={
          <Link href="/usuarios" className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]">
            ← Voltar
          </Link>
        }
      />

      <div className="px-6 pb-12">
        <form action={action} className="grid gap-5 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nome" name="nome" defaultValue={u.nome} required />
            <Field
              label="E-mail"
              name="email"
              type="email"
              defaultValue={u.email}
              required
            />
            <Field label="Telefone" name="telefone" defaultValue={u.telefone} />
            <Field
              label="ID no CRM"
              name="crmId"
              defaultValue={u.crmId}
              hint="ID do vendedor no CRM externo."
            />
          </div>

          <label className="block">
            <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
              Nível de acesso
            </span>
            <select
              name="role"
              defaultValue={u.role ?? "vendedor"}
              className="w-full rounded-[10px] py-[10px] px-3 text-[14px]"
              style={{
                backgroundColor: "var(--ink-2)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <option value="vendedor">Usuário (acesso restrito)</option>
              <option value="owner">Admin (acesso completo)</option>
            </select>
            <span className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5 block leading-snug">
              Owner pode editar tudo no tenant; vendedor só visualiza e atende seus leads.
            </span>
          </label>

          <Toggle
            label="Ativo"
            name="isActive"
            defaultChecked={u.isActive ?? true}
            hint="Se desativado, login bloqueia."
          />

          <fieldset className="rounded-md border border-[color:var(--b-soft)] bg-[color:var(--ink-3)] p-4">
            <legend className="text-sm font-medium text-[color:var(--fg)] px-2">
              Horários de atendimento
            </legend>
            <p className="text-[12px] text-[color:var(--fg-subtle)] mb-3">
              Defina os intervalos em que o usuário atende em cada dia. Sem
              nenhum intervalo cadastrado, o usuário fica fora da fila de
              distribuição. Use os atalhos ao lado para preencher um padrão e
              depois ajuste o que precisar.
            </p>
            <HorariosGrid initial={horariosInicial} />
          </fieldset>

          <fieldset className="rounded-md border border-[color:var(--b-soft)] bg-[color:var(--ink-3)] p-4">
            <legend className="text-sm font-medium text-[color:var(--fg)] px-2">
              Resetar senha
            </legend>
            <Field
              label="Nova senha"
              name="novaSenha"
              type="password"
              hint="Deixe em branco para manter a atual. Mínimo 6 caracteres. Será salva como hash bcrypt."
            />
          </fieldset>

          <div className="flex items-center justify-end gap-2 pt-2">
            <Link href="/usuarios" className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] px-3 py-2">
              Cancelar
            </Link>
            <SaveButton />
          </div>
        </form>
      </div>
    </>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes, type Loja } from "@/lib/db/schema";
import { normalizeSlotList } from "@/lib/crm/slots";
import { readSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/guard";
import { PageHeader } from "@/components/page-header";
import { ClientesTable } from "./clientes-table";
import { ClienteEditModal } from "./cliente-edit-modal";
import { ClienteCreateModal } from "./cliente-create-modal";

export default async function EditClientePage({
  searchParams,
}: {
  searchParams: Promise<{ detail?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  if (!isOwner(session)) redirect("/perfil");

  // is_superadmin lido fresco do DB (não do JWT)
  const meRow = await db
    .select({ isSuperadmin: clientes.isSuperadmin })
    .from(clientes)
    .where(eq(clientes.id, session.clienteId))
    .limit(1);
  const isSuper = meRow[0]?.isSuperadmin === true;

  const rows = isSuper
    ? await db.select().from(clientes)
    : await db.select().from(clientes).where(eq(clientes.id, session.clienteId));

  const { detail } = await searchParams;
  const isNew = detail === "new";
  const detailId = detail && detail !== "new" ? Number(detail) : null;
  const detailCliente =
    detailId && rows.find((c) => c.id === detailId);

  return (
    <>
      <PageHeader
        eyebrow="Configurações"
        title={isSuper ? "Clientes" : "Configurações do cliente"}
        subtitle={
          isSuper
            ? "Lista de tenants. Click em uma linha para editar dados, integrações WhatsApp/CRM, lojas e funis."
            : "Click na linha para abrir suas configurações completas."
        }
        actions={
          <div className="flex items-center gap-3">
            {isSuper && (
              <Link
                href="/perfil/cliente?detail=new"
                className="text-[12px] px-3 py-1.5 rounded-md"
                style={{
                  backgroundColor: "rgba(70,200,154,0.10)",
                  color: "var(--mint-200)",
                  border: "1px solid rgba(70,200,154,0.32)",
                }}
              >
                + Novo cliente
              </Link>
            )}
            <Link
              href="/perfil"
              className="text-sm text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            >
              ← Voltar
            </Link>
          </div>
        }
      />
      <div className="px-7 pb-12">
        <ClientesTable
          rows={rows.map((c) => ({
            id: c.id,
            nome: c.nome,
            email: c.email,
            telefone: c.telefone,
            crmTenant: c.crmTenant,
            lojasCount: Array.isArray(c.lojas) ? (c.lojas as Loja[]).length : 0,
            isSuperadmin: c.isSuperadmin === true,
          }))}
          viewerCanDelete={isSuper}
          viewerClienteId={session.clienteId}
        />
      </div>

      {detailCliente && isSuper && (() => {
        const idx = rows.findIndex((c) => c.id === detailCliente.id);
        const prevId = idx > 0 ? rows[idx - 1].id : null;
        const nextId = idx >= 0 && idx < rows.length - 1 ? rows[idx + 1].id : null;
        return (
          <ClienteCreateModal
            inicial={{
              id: detailCliente.id,
              nome: detailCliente.nome,
              email: detailCliente.email,
              telefone: detailCliente.telefone,
              crmTenant: detailCliente.crmTenant,
              crmToken: detailCliente.crmToken,
              apiBaseUrl: detailCliente.apiBaseUrl,
              apiInstanciaNome: detailCliente.apiInstanciaNome,
              apiToken: detailCliente.apiToken,
              crmOrigemId: detailCliente.crmOrigemId,
              crmStatusColunas: normalizeSlotList(
                detailCliente.crmStatusColunas,
              ),
              lojas: Array.isArray(detailCliente.lojas)
                ? (detailCliente.lojas as unknown as Array<{
                    nome: string;
                    crm_id: string;
                    [k: string]: unknown;
                  }>)
                : [],
              vendedores: Array.isArray(detailCliente.vendedores)
                ? (detailCliente.vendedores as Array<{
                    id: number;
                    nome: string | null;
                    email: string | null;
                    telefone: string | null;
                    is_active: boolean;
                    crm_id?: string | null;
                    horarios?: unknown;
                  }>)
                : [],
            }}
            prevId={prevId}
            nextId={nextId}
          />
        );
      })()}

      {detailCliente && !isSuper && (
        <ClienteEditModal
          cliente={{
            id: detailCliente.id,
            nome: detailCliente.nome,
            email: detailCliente.email,
            telefone: detailCliente.telefone,
            crmTenant: detailCliente.crmTenant,
            apiBaseUrl: detailCliente.apiBaseUrl,
            apiInstanciaNome: detailCliente.apiInstanciaNome,
            apiToken: null,
            crmToken: null,
            crmOrigemId: detailCliente.crmOrigemId,
            crmStatusColunas: normalizeSlotList(
              detailCliente.crmStatusColunas,
            ),
            isSuperadmin: detailCliente.isSuperadmin === true,
            lojas: Array.isArray(detailCliente.lojas)
              ? (detailCliente.lojas as Loja[])
              : [],
          }}
          viewerIsSuperadmin={false}
        />
      )}

      {isNew && isSuper && <ClienteCreateModal />}
    </>
  );
}

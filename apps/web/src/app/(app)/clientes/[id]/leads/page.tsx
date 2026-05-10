import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  isPlaceholderVendedor,
  leads,
  type Vendedor,
} from "@/lib/db/schema";
import { LeadsTable } from "../../../leads/leads-table";
import { resolveVendedorNome, type LeadRow } from "../../../leads/saude-lead";
import type { VendedorOption } from "../../../leads/actions";
import { loadClienteOrForbid, loadVendedoresFromCliente } from "../_data";
import { isClienteAdminReadOnly } from "@/lib/auth/guard";

export default async function ClienteLeadsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, isVendedor, vendedorUserId, session } =
    await loadClienteOrForbid(clienteId);
  // Cliente admin (kind=cliente, não super) é READ-ONLY em leads.
  const isClienteRO = isClienteAdminReadOnly(session, isSuper);
  const canEdit = !isClienteRO;
  const readOnlyReason: "cliente-admin" | null = isClienteRO
    ? "cliente-admin"
    : null;

  const vendedores = await loadVendedoresFromCliente(clienteId);

  // Filtros: clienteId sempre. Vendedor (kind=usuario) só os próprios.
  const filters = [eq(leads.clienteId, clienteId)];
  if (isVendedor && vendedorUserId !== null) {
    filters.push(eq(leads.vendedorId, vendedorUserId));
  }

  const rowsRaw = await db
    .select()
    .from(leads)
    .where(and(...filters))
    .orderBy(desc(leads.createdAt));

  const venMap = new Map<number, Vendedor>();
  for (const v of vendedores) {
    if (typeof v.id === "number") venMap.set(v.id, v);
  }

  const rows: LeadRow[] = rowsRaw.map((l) => ({
    ...l,
    clienteNome: cliente.nome,
    clienteTenant: cliente.crmTenant,
    vendedorNome: resolveVendedorNome(l, venMap),
  }));

  // Picker de vendedores — apenas os ativos do cliente.
  const vendedoresPorCliente: Record<number, VendedorOption[]> = {
    [cliente.id]: vendedores
      .filter((v) => !isPlaceholderVendedor(v))
      .map((v) => ({
        id: v.id,
        uid: v.uid,
        nome: v.nome ?? `Usuário #${v.id}`,
        role: v.role,
        is_active: v.is_active,
      })),
  };

  return (
    <div>
      <LeadsTable
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        isVendedor={isVendedor}
        vendedoresPorCliente={vendedoresPorCliente}
        readOnlyReason={readOnlyReason}
        embedded
      />
    </div>
  );
}

import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  isPlaceholderVendedor,
  leads,
  type Vendedor,
} from "@/lib/db/schema";
import { LeadsTable } from "../../../../../../leads/leads-table";
import {
  resolveVendedorNome,
  type LeadRow,
} from "../../../../../../leads/saude-lead";
import type { VendedorOption } from "../../../../../../leads/actions";
import { loadClienteOrForbid, loadVendedoresFromCliente } from "../../../../_data";
import { loadVendedor } from "../_data";
import { isClienteAdminReadOnly } from "@/lib/auth/guard";

export default async function VendedorLeadsPage({
  params,
}: {
  params: Promise<{ id: string; vendedorUid: string }>;
}) {
  const { id, vendedorUid } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, isVendedor, session } =
    await loadClienteOrForbid(clienteId);
  const isClienteRO = isClienteAdminReadOnly(session, isSuper);
  const canEdit = !isClienteRO;
  const readOnlyReason: "cliente-admin" | null = isClienteRO
    ? "cliente-admin"
    : null;
  const vendedor = await loadVendedor(clienteId, vendedorUid);
  const vendedoresAll = await loadVendedoresFromCliente(clienteId);

  // Filtra leads pelo vendedorId numérico (id legado).
  const rowsRaw = await db
    .select()
    .from(leads)
    .where(
      and(eq(leads.clienteId, clienteId), eq(leads.vendedorId, vendedor.id)),
    )
    .orderBy(desc(leads.createdAt));

  const venMap = new Map<number, Vendedor>();
  for (const v of vendedoresAll) {
    if (typeof v.id === "number") venMap.set(v.id, v);
  }

  const rows: LeadRow[] = rowsRaw.map((l) => ({
    ...l,
    clienteNome: cliente.nome,
    clienteTenant: cliente.crmTenant,
    vendedorNome: resolveVendedorNome(l, venMap),
  }));

  // Picker — apenas o vendedor atual (manter possibilidade de troca
  // só pra super; cliente comum vê o picker ainda mas restrito ao
  // próprio cliente).
  const vendedoresPorCliente: Record<number, VendedorOption[]> = {
    [cliente.id]: vendedoresAll
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
    <LeadsTable
      rows={rows}
      isSuper={isSuper}
      canEdit={canEdit}
      isVendedor={isVendedor}
      vendedoresPorCliente={vendedoresPorCliente}
      readOnlyReason={readOnlyReason}
      embedded
    />
  );
}

import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  isPlaceholderVendedor,
  leads,
  type Vendedor,
} from "@/lib/db/schema";
import { LeadsTable } from "../../../../../leads/leads-table";
import {
  resolveVendedorNome,
  type LeadRow,
} from "../../../../../leads/saude-lead";
import type { VendedorOption } from "../../../../../leads/actions";
import { loadClienteOrForbid, loadVendedoresFromCliente } from "../../../_data";
import { loadLoja } from "../_data";
import { isClienteAdminReadOnly } from "@/lib/auth/guard";

export default async function LojaLeadsPage({
  params,
}: {
  params: Promise<{ id: string; lojaId: string }>;
}) {
  const { id, lojaId } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, isVendedor, vendedorUserId, session } =
    await loadClienteOrForbid(clienteId);
  const isClienteRO = isClienteAdminReadOnly(session, isSuper);
  const canEdit = !isClienteRO;
  const readOnlyReason: "cliente-admin" | null = isClienteRO
    ? "cliente-admin"
    : null;
  const loja = await loadLoja(clienteId, lojaId);

  const vendedoresAll = await loadVendedoresFromCliente(clienteId);
  // Vendedores vinculados à loja — usado pra filtrar leads.
  const vendedoresDaLoja = vendedoresAll.filter((v) =>
    v.loja_ids.includes(loja.id),
  );
  const vendedorIdsDaLoja = vendedoresDaLoja.map((v) => v.id);

  // Filtros base.
  // Caveat: leads com vendedorId null ficam de fora. (Doc no plano.)
  const filters = [eq(leads.clienteId, clienteId)];
  if (vendedorIdsDaLoja.length === 0) {
    // Sem vendedores na loja — nenhum lead. Filtro impossível pra zerar.
    filters.push(eq(leads.id, -1));
  } else if (isVendedor && vendedorUserId !== null) {
    // Vendedor logado: só os próprios E vinculado à loja.
    if (!vendedorIdsDaLoja.includes(vendedorUserId)) {
      filters.push(eq(leads.id, -1));
    } else {
      filters.push(eq(leads.vendedorId, vendedorUserId));
    }
  } else {
    filters.push(inArray(leads.vendedorId, vendedorIdsDaLoja));
  }

  const rowsRaw = await db
    .select()
    .from(leads)
    .where(and(...filters))
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

  // Picker — só vendedores da loja.
  const vendedoresPorCliente: Record<number, VendedorOption[]> = {
    [cliente.id]: vendedoresDaLoja
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

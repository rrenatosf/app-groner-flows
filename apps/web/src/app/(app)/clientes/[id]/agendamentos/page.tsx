import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agendamentos, leads, type Vendedor } from "@/lib/db/schema";
import { AgendamentosTable } from "../../../agendamentos/agendamentos-table";
import { resolveVendedorNome } from "../../../leads/saude-lead";
import type { AgendamentoRow } from "../../../agendamentos/saude-agendamento";
import { loadClienteOrForbid, loadVendedoresFromCliente } from "../_data";
import { isClienteAdminReadOnly } from "@/lib/auth/guard";

export default async function ClienteAgendamentosPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clienteId = Number(id);
  const { cliente, isSuper, isVendedor, vendedorUserId, session } =
    await loadClienteOrForbid(clienteId);
  const isClienteRO = isClienteAdminReadOnly(session, isSuper);
  const canEdit = !isClienteRO;
  const readOnlyReason: "cliente-admin" | null = isClienteRO
    ? "cliente-admin"
    : null;

  const vendedores = await loadVendedoresFromCliente(clienteId);

  const filters = [eq(leads.clienteId, clienteId)];
  if (isVendedor && vendedorUserId !== null) {
    filters.push(eq(leads.vendedorId, vendedorUserId));
  }

  const rowsRaw = await db
    .select({
      id: agendamentos.id,
      createdAt: agendamentos.createdAt,
      leadId: agendamentos.leadId,
      dataAgendamento: agendamentos.dataAgendamento,
      statusAgendamento: agendamentos.statusAgendamento,
      observacaoAgendamento: agendamentos.observacaoAgendamento,
      leadNome: leads.nome,
      leadTelefone: leads.telefone,
      leadClienteId: leads.clienteId,
      vendedorId: leads.vendedorId,
      vendedorSnap: leads.vendedor,
    })
    .from(agendamentos)
    .innerJoin(leads, eq(leads.id, agendamentos.leadId))
    .where(and(...filters))
    .orderBy(desc(agendamentos.dataAgendamento));

  const venMap = new Map<number, Vendedor>();
  for (const v of vendedores) {
    if (typeof v.id === "number") venMap.set(v.id, v);
  }

  const rows: AgendamentoRow[] = rowsRaw.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    leadId: r.leadId,
    dataAgendamento: r.dataAgendamento,
    statusAgendamento: r.statusAgendamento,
    observacaoAgendamento: r.observacaoAgendamento,
    clienteId: r.leadClienteId,
    clienteNome: cliente.nome,
    clienteTenant: cliente.crmTenant,
    leadNome: r.leadNome,
    leadTelefone: r.leadTelefone,
    vendedorId: r.vendedorId,
    vendedorNome: resolveVendedorNome(
      { vendedorId: r.vendedorId, vendedor: r.vendedorSnap },
      venMap,
    ),
  }));

  return (
    <div>
      <AgendamentosTable
        rows={rows}
        isSuper={isSuper}
        canEdit={canEdit}
        readOnlyReason={readOnlyReason}
        embedded
      />
    </div>
  );
}

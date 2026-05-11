import "server-only";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes, leads, type Vendedor } from "@/lib/db/schema";

export type LeadRow = {
  id: number;
  createdAt: Date;
  nome: string | null;
  telefone: string | null;
  leadId: string | null;
  projetoId: string | null;
  statusNome: string | null;
  statusId: string | null;
  etapaNome: string | null;
  etapaId: string | null;
  vendedorId: number | null;
  vendedorNome: string | null;
  agendamentoId: number | null;
  stepFollowup: number | null;
  statusFollowup: string | null;
  proximoFollowup: Date | null;
  sessionId: string | null;
};

export async function listLeadsByCliente(
  clienteId: number,
  opts: { restrictToUserId?: number; q?: string } = {},
): Promise<LeadRow[]> {
  const filters = [eq(leads.clienteId, clienteId)];
  if (opts.restrictToUserId) {
    filters.push(eq(leads.vendedorId, opts.restrictToUserId));
  }
  if (opts.q && opts.q.trim()) {
    const like = `%${opts.q.trim()}%`;
    filters.push(
      or(
        ilike(leads.nome, like),
        ilike(leads.telefone, like),
        ilike(leads.leadId, like),
        ilike(leads.etapaNome, like),
        ilike(leads.statusNome, like),
      )!,
    );
  }

  const [rows, [clienteRow]] = await Promise.all([
    db
      .select({
        id: leads.id,
        createdAt: leads.createdAt,
        nome: leads.nome,
        telefone: leads.telefone,
        leadId: leads.leadId,
        projetoId: leads.projetoId,
        statusNome: leads.statusNome,
        statusId: leads.statusId,
        etapaNome: leads.etapaNome,
        etapaId: leads.etapaId,
        vendedorId: leads.vendedorId,
        agendamentoId: leads.agendamentoId,
        stepFollowup: leads.stepFollowup,
        statusFollowup: leads.statusFollowup,
        proximoFollowup: leads.proximoFollowup,
        sessionId: leads.sessionId,
        clienteAutomacaoId: leads.clienteAutomacaoId,
      })
      .from(leads)
      .where(and(...filters))
      .orderBy(desc(leads.createdAt)),
    db
      .select({ vendedores: clientes.vendedores })
      .from(clientes)
      .where(eq(clientes.id, clienteId))
      .limit(1),
  ]);

  // Resolve vendedorNome a partir do jsonb vendedores do cliente.
  const vendedoresArr: Vendedor[] = Array.isArray(clienteRow?.vendedores)
    ? (clienteRow.vendedores as Vendedor[])
    : [];
  const vendedorNomeById = new Map<number, string | null>();
  for (const v of vendedoresArr) vendedorNomeById.set(v.id, v.nome ?? null);

  return rows.map((r) => ({
    ...r,
    vendedorNome:
      r.vendedorId !== null ? vendedorNomeById.get(r.vendedorId) ?? null : null,
  }));
}

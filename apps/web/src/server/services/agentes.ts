import "server-only";
import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentes, clientes, leads } from "@/lib/db/schema";

export type AgenteRow = {
  id: number;
  clienteId: number;
  clienteNome?: string | null;
  clienteTenant?: string | null;
  name: string;
  description: string | null;
  prompt: string | null;
  isActive: boolean;
  debounceTime: number;
  maxFollowups: number;
  humanIntervention: boolean;
  voiceGender: string | null;
  idN8n: string | null;
  leadsAtendidos: number;
  leadsAtendidosIa: number;
};

export async function listAgentesByCliente(
  clienteId: number,
  q?: string,
): Promise<AgenteRow[]> {
  const filters = [eq(agentes.clienteId, clienteId)];
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    filters.push(
      or(
        ilike(agentes.name, like),
        ilike(agentes.description, like),
        ilike(agentes.prompt, like),
      )!,
    );
  }

  const rows = await db
    .select()
    .from(agentes)
    .where(and(...filters))
    .orderBy(asc(agentes.id));

  const [iaTotalRow] = await db
    .select({ v: count() })
    .from(leads)
    .where(and(eq(leads.clienteId, clienteId), isNull(leads.vendedorId)));

  const [totalRow] = await db
    .select({ v: count() })
    .from(leads)
    .where(eq(leads.clienteId, clienteId));

  return rows.map((a) => ({
    id: a.id,
    clienteId: a.clienteId,
    name: a.name,
    description: a.description,
    prompt: a.prompt,
    isActive: a.isActive,
    debounceTime: a.debounceTime,
    maxFollowups: a.maxFollowups,
    humanIntervention: a.humanIntervention,
    voiceGender: a.voiceGender,
    idN8n: a.idN8n,
    leadsAtendidos: totalRow.v,
    leadsAtendidosIa: iaTotalRow.v,
  }));
}

/**
 * Lista TODOS os agentes (cross-tenant). Apenas pra superadmin.
 * Inclui dados do cliente dono pra coluna "Tenant".
 */
export async function listAllAgentes(q?: string): Promise<AgenteRow[]> {
  const filters = [] as ReturnType<typeof eq>[];
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    // Busca em name/description/prompt/idN8n do agente E em
    // clientes.nome / crm_tenant — superadmin pesquisa pelo nome do
    // tenant também (ex: "Sol Tech").
    filters.push(
      or(
        ilike(agentes.name, like),
        ilike(agentes.description, like),
        ilike(agentes.prompt, like),
        ilike(agentes.idN8n, like),
        ilike(clientes.nome, like),
        ilike(clientes.crmTenant, like),
      )!,
    );
  }

  const rows = await db
    .select({
      id: agentes.id,
      clienteId: agentes.clienteId,
      name: agentes.name,
      description: agentes.description,
      prompt: agentes.prompt,
      isActive: agentes.isActive,
      debounceTime: agentes.debounceTime,
      maxFollowups: agentes.maxFollowups,
      humanIntervention: agentes.humanIntervention,
      voiceGender: agentes.voiceGender,
      idN8n: agentes.idN8n,
      clienteNome: clientes.nome,
      clienteTenant: clientes.crmTenant,
    })
    .from(agentes)
    .leftJoin(clientes, eq(clientes.id, agentes.clienteId))
    .where(filters.length > 0 ? and(...filters) : undefined)
    .orderBy(asc(agentes.clienteId), asc(agentes.id));

  // Contagens por cliente — single query agregada
  const counts = await db
    .select({
      clienteId: leads.clienteId,
      total: count(),
      ia: sql<number>`COUNT(*) FILTER (WHERE ${leads.vendedorId} IS NULL)`,
    })
    .from(leads)
    .groupBy(leads.clienteId);

  const countByCliente = new Map<number, { total: number; ia: number }>();
  for (const c of counts) {
    if (c.clienteId === null) continue;
    countByCliente.set(c.clienteId, {
      total: Number(c.total),
      ia: Number(c.ia),
    });
  }

  return rows.map((a) => {
    const c = countByCliente.get(a.clienteId) ?? { total: 0, ia: 0 };
    return {
      id: a.id,
      clienteId: a.clienteId,
      clienteNome: a.clienteNome,
      clienteTenant: a.clienteTenant,
      name: a.name,
      description: a.description,
      prompt: a.prompt,
      isActive: a.isActive,
      debounceTime: a.debounceTime,
      maxFollowups: a.maxFollowups,
      humanIntervention: a.humanIntervention,
      voiceGender: a.voiceGender,
      idN8n: a.idN8n,
      leadsAtendidos: c.total,
      leadsAtendidosIa: c.ia,
    };
  });
}

export async function getAgenteById(
  clienteId: number,
  agenteId: number,
): Promise<AgenteRow | null> {
  const row = await db.query.agentes.findFirst({
    where: and(eq(agentes.clienteId, clienteId), eq(agentes.id, agenteId)),
  });
  if (!row) return null;
  const [iaTotalRow] = await db
    .select({ v: count() })
    .from(leads)
    .where(and(eq(leads.clienteId, clienteId), isNull(leads.vendedorId)));
  const [totalRow] = await db
    .select({ v: count() })
    .from(leads)
    .where(eq(leads.clienteId, clienteId));
  return {
    id: row.id,
    clienteId: row.clienteId,
    name: row.name,
    description: row.description,
    prompt: row.prompt,
    isActive: row.isActive,
    debounceTime: row.debounceTime,
    maxFollowups: row.maxFollowups,
    humanIntervention: row.humanIntervention,
    voiceGender: row.voiceGender,
    idN8n: row.idN8n,
    leadsAtendidos: totalRow.v,
    leadsAtendidosIa: iaTotalRow.v,
  };
}
void sql;

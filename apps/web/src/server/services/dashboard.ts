import "server-only";
import {
  and,
  asc,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  agendamentos,
  agentes,
  clientes,
  isPlaceholderVendedor,
  leads,
  type Vendedor,
} from "@/lib/db/schema";
import type { SessionPayload } from "@/lib/auth/session";

export type DashboardData = {
  cliente: {
    id: number;
    nome: string | null;
    email: string | null;
    crmTenant: string | null;
  };
  totals: {
    leadsAtivos: number;
    agendamentosProximos: number;
    agentesAtivos: number;
    agentesTotal: number;
    usuariosAtivos: number;
    usuariosTotal: number;
  };
  leadsByOrigem: { ia: number; humano: number };
  funil: { etapa: string; total: number }[];
  proximosFollowups: {
    id: number;
    nome: string | null;
    telefone: string | null;
    proximoFollowup: Date | null;
    statusNome: string | null;
  }[];
  agentes: {
    id: number;
    name: string;
    isActive: boolean;
    debounceTime: number;
    maxFollowups: number;
    humanIntervention: boolean;
    voiceGender: string | null;
    idN8n: string | null;
  }[];
};

const FUNNEL_DEFAULT_STAGES = [
  "Novo",
  "Em conversa",
  "Qualificado",
  "Agendado",
];

export async function getDashboardData(
  session: SessionPayload,
): Promise<DashboardData | null> {
  const clienteRow = await db.query.clientes.findFirst({
    where: eq(clientes.id, session.clienteId),
  });
  if (!clienteRow) {
    // Cliente foi removido (ou cookie stale). Sinaliza o caller para
    // limpar sessão e redirecionar pra login.
    return null;
  }

  const restrictByVendedor =
    session.kind === "usuario"
      ? eq(leads.vendedorId, session.userId)
      : undefined;

  const baseLeadFilter = restrictByVendedor
    ? and(eq(leads.clienteId, session.clienteId), restrictByVendedor)
    : eq(leads.clienteId, session.clienteId);

  const now = new Date();
  const in7d = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const agendamentoBase = and(
    gte(agendamentos.dataAgendamento, now),
    lte(agendamentos.dataAgendamento, in7d),
  );

  const agendamentoFilter =
    session.kind === "usuario"
      ? and(
          agendamentoBase,
          sql`exists (select 1 from ${leads} l where l.id = ${agendamentos.leadId} and l.cliente_id = ${session.clienteId} and l.vendedor_id = ${session.userId})`,
        )
      : and(
          agendamentoBase,
          sql`exists (select 1 from ${leads} l where l.id = ${agendamentos.leadId} and l.cliente_id = ${session.clienteId})`,
        );

  const [
    [leadsAtivos],
    [leadsIa],
    [leadsHumano],
    [agentesAtivos],
    [agentesTotal],
    clienteForVendedores,
    [agendamentosRow],
    funilRows,
    followups,
    agentesRows,
  ] = await Promise.all([
    db.select({ value: count() }).from(leads).where(baseLeadFilter),
    db
      .select({ value: count() })
      .from(leads)
      .where(and(baseLeadFilter, isNull(leads.vendedorId))),
    db
      .select({ value: count() })
      .from(leads)
      .where(and(baseLeadFilter, isNotNull(leads.vendedorId))),
    db
      .select({ value: count() })
      .from(agentes)
      .where(
        and(
          eq(agentes.clienteId, session.clienteId),
          eq(agentes.isActive, true),
        ),
      ),
    db
      .select({ value: count() })
      .from(agentes)
      .where(eq(agentes.clienteId, session.clienteId)),
    // Vendedores agora são jsonb em clientes.vendedores — não há mais tabela usuarios.
    db
      .select({ vendedores: clientes.vendedores })
      .from(clientes)
      .where(eq(clientes.id, session.clienteId))
      .limit(1),
    db
      .select({ value: count() })
      .from(agendamentos)
      .where(agendamentoFilter),
    db
      .select({ etapa: leads.etapaNome, total: count() })
      .from(leads)
      .where(and(baseLeadFilter, isNotNull(leads.etapaNome)))
      .groupBy(leads.etapaNome),
    db
      .select({
        id: leads.id,
        nome: leads.nome,
        telefone: leads.telefone,
        proximoFollowup: leads.proximoFollowup,
        statusNome: leads.statusNome,
      })
      .from(leads)
      .where(and(baseLeadFilter, isNotNull(leads.proximoFollowup)))
      .orderBy(asc(leads.proximoFollowup))
      .limit(5),
    db
      .select({
        id: agentes.id,
        name: agentes.name,
        isActive: agentes.isActive,
        debounceTime: agentes.debounceTime,
        maxFollowups: agentes.maxFollowups,
        humanIntervention: agentes.humanIntervention,
        voiceGender: agentes.voiceGender,
        idN8n: agentes.idN8n,
      })
      .from(agentes)
      .where(eq(agentes.clienteId, session.clienteId))
      .orderBy(asc(agentes.id)),
  ]);

  const vendedoresRaw: Vendedor[] = Array.isArray(
    clienteForVendedores[0]?.vendedores,
  )
    ? (clienteForVendedores[0].vendedores as Vendedor[])
    : [];
  // Ignora o placeholder canonical (id=0 / sem email) que existe só
  // pra ancorar o shape do jsonb no insert do cliente.
  const vendedoresArray = vendedoresRaw.filter(
    (v) => !isPlaceholderVendedor(v),
  );
  const vendedoresStat = {
    total: vendedoresArray.length,
    ativos: vendedoresArray.filter((v) => v.is_active === true).length,
  };

  const funilMap = new Map<string, number>();
  for (const r of funilRows) {
    if (r.etapa) funilMap.set(r.etapa, r.total);
  }
  const funil =
    funilMap.size > 0
      ? Array.from(funilMap.entries()).map(([etapa, total]) => ({
          etapa,
          total,
        }))
      : FUNNEL_DEFAULT_STAGES.map((etapa) => ({ etapa, total: 0 }));

  return {
    cliente: {
      id: clienteRow.id,
      nome: clienteRow.nome,
      email: clienteRow.email,
      crmTenant: clienteRow.crmTenant,
    },
    totals: {
      leadsAtivos: leadsAtivos.value,
      agendamentosProximos: agendamentosRow.value,
      agentesAtivos: agentesAtivos.value,
      agentesTotal: agentesTotal.value,
      usuariosAtivos: vendedoresStat.ativos,
      usuariosTotal: vendedoresStat.total,
    },
    leadsByOrigem: { ia: leadsIa.value, humano: leadsHumano.value },
    funil,
    proximosFollowups: followups,
    agentes: agentesRows,
  };
}
// suppress unused import warning
void ne;

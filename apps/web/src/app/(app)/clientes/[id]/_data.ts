import "server-only";
import { cache } from "react";
import { and, asc, eq } from "drizzle-orm";
import { forbidden, notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import {
  agentes,
  automacoes,
  clientes,
  clientesAutomacoes,
  isPlaceholderLoja,
  isPlaceholderVendedor,
  type Automacao,
  type Loja,
  type Vendedor,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import type { ClienteRow } from "../clientes-table";
import type { AgenteRowFull } from "../../agentes/agentes-table";
import type { InstanciaRowFull } from "../../automacoes/saude-instancia";

export type ClienteDrilldownContext = {
  cliente: ClienteRow;
  isSuper: boolean;
  /** Sessão atual (cliente ou vendedor). */
  session: NonNullable<Awaited<ReturnType<typeof readSession>>>;
  /** True se o caller é vendedor (kind=usuario) — restrições adicionais. */
  isVendedor: boolean;
  /** UID do vendedor logado (apenas se isVendedor). */
  vendedorUserId: number | null;
};

/**
 * Carrega o cliente alvo do drilldown e valida permissão de leitura.
 * - Super: lê qualquer cliente.
 * - Cliente kind=cliente: só o próprio.
 * - Vendedor kind=usuario: só o próprio tenant (mesmo clienteId).
 *
 * Cacheado por request via react.cache. Lança via `forbidden()` ou
 * `notFound()` quando aplicável (Next 16 idiomatic).
 */
export const loadClienteOrForbid = cache(
  async (clienteId: number): Promise<ClienteDrilldownContext> => {
    const session = await readSession();
    if (!session) forbidden();

    const isSuper = await isSuperadminFresh(session);
    const isVendedor = session.kind === "usuario";

    // Tenant guard: cliente comum / vendedor só vê o próprio clienteId.
    if (!isSuper && session.clienteId !== clienteId) {
      forbidden();
    }

    const row = await db.query.clientes.findFirst({
      where: eq(clientes.id, clienteId),
    });
    if (!row) notFound();

    const cliente: ClienteRow = {
      id: row.id,
      createdAt: row.createdAt ?? null,
      nome: row.nome,
      email: row.email,
      telefone: row.telefone,
      senha: row.senha,
      isActive: row.isActive ?? null,
      apiToken: row.apiToken,
      apiInstanciaNome: row.apiInstanciaNome,
      apiBaseUrl: row.apiBaseUrl,
      crmTenant: row.crmTenant,
      crmToken: row.crmToken,
      crmOrigemId: row.crmOrigemId,
      crmStatusColunas: row.crmStatusColunas ?? null,
      isSuperadmin: row.isSuperadmin ?? null,
    };

    return {
      cliente,
      isSuper,
      session,
      isVendedor,
      vendedorUserId: isVendedor ? session.userId : null,
    };
  },
);

/** Lista de lojas válidas (não-placeholder) do cliente, cacheada. */
export const loadLojasFromCliente = cache(
  async (clienteId: number): Promise<Loja[]> => {
    const ctx = await loadClienteOrForbid(clienteId);
    const row = await db.query.clientes.findFirst({
      where: eq(clientes.id, ctx.cliente.id),
    });
    const list = Array.isArray(row?.lojas) ? (row.lojas as Loja[]) : [];
    return list.filter((l) => !isPlaceholderLoja(l));
  },
);

/** Lista de vendedores válidos (não-placeholder) do cliente, cacheada. */
export const loadVendedoresFromCliente = cache(
  async (clienteId: number): Promise<Vendedor[]> => {
    const ctx = await loadClienteOrForbid(clienteId);
    const row = await db.query.clientes.findFirst({
      where: eq(clientes.id, ctx.cliente.id),
    });
    const list = Array.isArray(row?.vendedores)
      ? (row.vendedores as Vendedor[])
      : [];
    return list.filter((v) => !isPlaceholderVendedor(v));
  },
);

/** Resolve uma loja específica (UUID) dentro de um cliente.
 *  Vendedor (kind=usuario) só pode acessar lojas onde o próprio
 *  vendedor está vinculado via `loja_ids`. */
export const loadLojaOrNotFound = cache(
  async (clienteId: number, lojaId: string): Promise<Loja> => {
    const ctx = await loadClienteOrForbid(clienteId);
    const lojas = await loadLojasFromCliente(clienteId);
    const loja = lojas.find((l) => l.id === lojaId);
    if (!loja) notFound();
    if (ctx.isVendedor) {
      const vendedores = await loadVendedoresFromCliente(clienteId);
      const me = vendedores.find((v) => v.id === ctx.vendedorUserId);
      const allowed = (me?.loja_ids ?? []).includes(lojaId);
      if (!allowed) notFound();
    }
    return loja;
  },
);

/** Lista de lojas que o caller pode ver dentro do cliente.
 *  Super/cliente admin vêem todas. Vendedor vê só onde está vinculado. */
export const loadLojasVisiveis = cache(
  async (clienteId: number): Promise<Loja[]> => {
    const ctx = await loadClienteOrForbid(clienteId);
    const lojas = await loadLojasFromCliente(clienteId);
    if (!ctx.isVendedor) return lojas;
    const vendedores = await loadVendedoresFromCliente(clienteId);
    const me = vendedores.find((v) => v.id === ctx.vendedorUserId);
    const ids = new Set(me?.loja_ids ?? []);
    return lojas.filter((l) => ids.has(l.id));
  },
);

/** Lista de agentes do cliente, com nome/tenant injetados (cacheada).
 *  Usa o gate de tenant via `loadClienteOrForbid`. */
export const loadAgentesFromCliente = cache(
  async (clienteId: number): Promise<AgenteRowFull[]> => {
    const ctx = await loadClienteOrForbid(clienteId);
    const rows = await db
      .select()
      .from(agentes)
      .where(eq(agentes.clienteId, clienteId))
      .orderBy(asc(agentes.name));
    return rows.map((a) => ({
      ...a,
      clienteNome: ctx.cliente.nome,
      clienteTenant: ctx.cliente.crmTenant,
    }));
  },
);

/** Instâncias de automação do cliente (cliente_automacoes JOIN automacoes).
 *  Vendedor (kind=usuario) só vê instâncias cuja `lojaId` esteja em
 *  `me.loja_ids`. Super/cliente admin vêem todas do tenant. */
export const loadInstanciasFromCliente = cache(
  async (clienteId: number): Promise<InstanciaRowFull[]> => {
    const ctx = await loadClienteOrForbid(clienteId);

    let allowedLojaIds: Set<string> | null = null;
    if (ctx.isVendedor) {
      const vendedores = await loadVendedoresFromCliente(clienteId);
      const me = vendedores.find((v) => v.id === ctx.vendedorUserId);
      allowedLojaIds = new Set(me?.loja_ids ?? []);
    }

    const rows = await db
      .select({
        id: clientesAutomacoes.id,
        createdAt: clientesAutomacoes.createdAt,
        automacaoId: clientesAutomacoes.automacaoId,
        clienteId: clientesAutomacoes.clienteId,
        lojaId: clientesAutomacoes.lojaId,
        dadosConfiguracoes: clientesAutomacoes.dadosConfiguracoes,
        isActive: clientesAutomacoes.isActive,
        catalogoNome: automacoes.nome,
        catalogoBaseUrl: automacoes.baseUrl,
        catalogoWorkflowId: automacoes.n8nWorkflowId,
        catalogoVersao: automacoes.versao,
        catalogoTemplate: automacoes.dadosConfiguracoesTemplate,
      })
      .from(clientesAutomacoes)
      .innerJoin(
        automacoes,
        eq(clientesAutomacoes.automacaoId, automacoes.id),
      )
      .where(eq(clientesAutomacoes.clienteId, clienteId))
      .orderBy(asc(automacoes.nome));

    return allowedLojaIds
      ? rows.filter((r) => allowedLojaIds!.has(r.lojaId))
      : rows;
  },
);

/** Instâncias de uma loja específica (gating de tenant + vendedor via
 *  `loadLojaOrNotFound`). */
export const loadInstanciasFromLoja = cache(
  async (
    clienteId: number,
    lojaId: string,
  ): Promise<InstanciaRowFull[]> => {
    await loadClienteOrForbid(clienteId);
    // loadLojaOrNotFound garante: loja existe, e (se vendedor) está
    // vinculada via loja_ids. Vendedor não-vinculado => notFound().
    await loadLojaOrNotFound(clienteId, lojaId);
    const rows = await db
      .select({
        id: clientesAutomacoes.id,
        createdAt: clientesAutomacoes.createdAt,
        automacaoId: clientesAutomacoes.automacaoId,
        clienteId: clientesAutomacoes.clienteId,
        lojaId: clientesAutomacoes.lojaId,
        dadosConfiguracoes: clientesAutomacoes.dadosConfiguracoes,
        isActive: clientesAutomacoes.isActive,
        catalogoNome: automacoes.nome,
        catalogoBaseUrl: automacoes.baseUrl,
        catalogoWorkflowId: automacoes.n8nWorkflowId,
        catalogoVersao: automacoes.versao,
        catalogoTemplate: automacoes.dadosConfiguracoesTemplate,
      })
      .from(clientesAutomacoes)
      .innerJoin(
        automacoes,
        eq(clientesAutomacoes.automacaoId, automacoes.id),
      )
      .where(
        and(
          eq(clientesAutomacoes.clienteId, clienteId),
          eq(clientesAutomacoes.lojaId, lojaId),
        ),
      )
      .orderBy(asc(automacoes.nome));
    return rows;
  },
);

/** Catálogo ativo (sem JOIN com clientes). Usado nos modais "Atribuir
 *  automação" pra preencher SearchableSelect. */
export const loadCatalogoAtivo = cache(async (): Promise<Automacao[]> => {
  return db
    .select()
    .from(automacoes)
    .where(eq(automacoes.isActive, true))
    .orderBy(asc(automacoes.nome));
});

/** Resolve um vendedor específico (uid) dentro de um cliente. */
export const loadVendedorOrNotFound = cache(
  async (clienteId: number, vendedorUid: string): Promise<Vendedor> => {
    const vendedores = await loadVendedoresFromCliente(clienteId);
    const v = vendedores.find((x) => x.uid === vendedorUid);
    if (!v) notFound();
    return v;
  },
);

import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import type { SessionPayload } from "./session";

export class ForbiddenError extends Error {
  constructor(message = "Apenas o dono da loja pode realizar essa ação.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function isOwner(session: SessionPayload | null): boolean {
  return session?.kind === "cliente";
}

export function requireOwner(session: SessionPayload | null): SessionPayload {
  if (!session) throw new ForbiddenError("Sessão expirada.");
  if (session.kind !== "cliente") throw new ForbiddenError();
  return session;
}

/**
 * Garante que o caller é superadmin Groner. Lê fresco do banco (não confia
 * no JWT, que é stale e ignorado). Lança ForbiddenError se não for.
 */
export async function requireSuperadmin(
  session: SessionPayload | null,
): Promise<SessionPayload> {
  const s = requireOwner(session);
  const r = await db
    .select({ isSuperadmin: clientes.isSuperadmin })
    .from(clientes)
    .where(eq(clientes.id, s.clienteId))
    .limit(1);
  if (r[0]?.isSuperadmin !== true) {
    throw new ForbiddenError(
      "Apenas superadmin Groner pode realizar essa ação.",
    );
  }
  return s;
}

export async function isSuperadminFresh(
  session: SessionPayload | null,
): Promise<boolean> {
  if (!session || session.kind !== "cliente") return false;
  const r = await db
    .select({ isSuperadmin: clientes.isSuperadmin })
    .from(clientes)
    .where(eq(clientes.id, session.clienteId))
    .limit(1);
  return r[0]?.isSuperadmin === true;
}

/**
 * Cliente admin (kind=cliente, não super) é READ-ONLY em tabelas com
 * automações (leads, agendamentos). Edição passa pelo CRM, não pelo app —
 * editar local cria drift que webhooks/IA sobrescrevem.
 */
export function isClienteAdminReadOnly(
  session: SessionPayload | null,
  isSuper: boolean,
): boolean {
  if (!session) return false;
  return session.kind === "cliente" && !isSuper;
}

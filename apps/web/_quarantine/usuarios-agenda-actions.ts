"use server";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes, type Vendedor } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { requireOwner } from "@/lib/auth/guard";
import type { ResultadoAgenda } from "@/lib/agenda";

async function loadCliente(clienteId: number) {
  return db.query.clientes.findFirst({
    where: eq(clientes.id, clienteId),
  });
}

/** Verifica se o vendedor (pelo email) tem refresh token Google no CRM e
 *  se a agenda responde aos parâmetros. Faz 2 chamadas:
 *    A) GET https://<tenant>.api.groner.app/api/Usuario/ObterDadosGoogle/<email>
 *    B) GET https://googlecalendar.groner.app/<tenant>/calendar/events?refreshToken=...
 *
 *  Retorna `ResultadoAgenda` com status estruturado.
 */
async function validateAgendaInterno(
  cliente: NonNullable<Awaited<ReturnType<typeof loadCliente>>>,
  vendedor: Vendedor,
): Promise<ResultadoAgenda> {
  const email = (vendedor.email ?? "").trim();
  if (!email) {
    return {
      id: vendedor.id,
      email: null,
      conexao: "sem_email",
      permissao: "nao_aplica",
    };
  }
  const tenant = cliente.crmTenant;
  const crmToken = cliente.crmToken;
  if (!tenant || !crmToken) {
    return {
      id: vendedor.id,
      email,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: "CRM tenant ou token não configurado no cliente.",
    };
  }

  // A) Buscar refresh token via CRM
  let refreshToken: string | null = null;
  try {
    const url = `https://${tenant}.api.groner.app/api/Usuario/ObterDadosGoogle/${encodeURIComponent(email)}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${crmToken}`,
      },
      cache: "no-store",
    });
    if (!resp.ok) {
      return {
        id: vendedor.id,
        email,
        conexao: "erro",
        permissao: "nao_aplica",
        detail: `CRM HTTP ${resp.status}.`,
      };
    }
    const raw = (await resp.json()) as { Content?: { refreshToken?: string } };
    refreshToken = raw?.Content?.refreshToken ?? null;
    if (!refreshToken) {
      return {
        id: vendedor.id,
        email,
        conexao: "nao_conectada",
        permissao: "nao_aplica",
      };
    }
  } catch (e) {
    return {
      id: vendedor.id,
      email,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: e instanceof Error ? e.message : String(e),
    };
  }

  // B) Tentar buscar eventos do calendar — conexão já está OK aqui
  try {
    const params = new URLSearchParams({
      refreshToken,
      calendarId: "primary",
      maxResults: "1",
      singleEvents: "true",
      orderBy: "startTime",
      timeMin: new Date().toISOString(),
    });
    const url = `https://googlecalendar.groner.app/${tenant}/calendar/events?${params.toString()}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (resp.ok) {
      return { id: vendedor.id, email, conexao: "ok", permissao: "ok" };
    }
    if (resp.status === 401 || resp.status === 403) {
      const text = await resp.text().catch(() => "");
      return {
        id: vendedor.id,
        email,
        conexao: "ok",
        permissao: "negada",
        detail: text.slice(0, 200) || `HTTP ${resp.status}`,
      };
    }
    const text = await resp.text().catch(() => "");
    const lower = text.toLowerCase();
    if (
      lower.includes("permission") ||
      lower.includes("permissão") ||
      lower.includes("scope") ||
      lower.includes("insufficient")
    ) {
      return {
        id: vendedor.id,
        email,
        conexao: "ok",
        permissao: "negada",
        detail: text.slice(0, 200),
      };
    }
    return {
      id: vendedor.id,
      email,
      conexao: "ok",
      permissao: "erro",
      detail: `HTTP ${resp.status}: ${text.slice(0, 200)}`,
    };
  } catch (e) {
    return {
      id: vendedor.id,
      email,
      conexao: "ok",
      permissao: "erro",
      detail: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Server Action: valida 1 vendedor pelo id. */
export async function validateAgendaUsuarioAction(
  formData: FormData,
): Promise<ResultadoAgenda> {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  if (!Number.isFinite(id)) {
    return {
      id: 0,
      email: null,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: "id inválido",
    };
  }
  const cliente = await loadCliente(session.clienteId);
  if (!cliente) {
    return {
      id,
      email: null,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: "Cliente não encontrado.",
    };
  }
  const vendedores = (cliente.vendedores ?? []) as Vendedor[];
  const v = vendedores.find((x) => x.id === id);
  if (!v) {
    return {
      id,
      email: null,
      conexao: "erro",
      permissao: "nao_aplica",
      detail: "Vendedor não encontrado.",
    };
  }
  return validateAgendaInterno(cliente, v);
}

/** Server Action: valida todos vendedores ativos do cliente em paralelo. */
export async function validateAgendaTodosAction(): Promise<ResultadoAgenda[]> {
  const session = requireOwner(await readSession());
  const cliente = await loadCliente(session.clienteId);
  if (!cliente) return [];
  const vendedores = ((cliente.vendedores ?? []) as Vendedor[]).filter(
    (v) => v.is_active,
  );
  return Promise.all(vendedores.map((v) => validateAgendaInterno(cliente, v)));
}

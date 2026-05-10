"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentes, clientes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import {
  isSuperadminFresh,
  requireOwner,
  requireSuperadmin,
} from "@/lib/auth/guard";
import { createAgente, setAgenteActive } from "@/server/services/mutations";
import { duplicateParentWorkflow } from "@/lib/n8n";

export async function toggleAgenteActiveAction(formData: FormData) {
  const session = requireOwner(await readSession());
  const id = Number(formData.get("id"));
  const next = formData.get("next") === "1";
  if (!Number.isFinite(id)) throw new Error("id inválido");
  // Superadmin pode alternar agente de qualquer tenant.
  let targetClienteId = session.clienteId;
  if (await isSuperadminFresh(session)) {
    const owner = await db
      .select({ clienteId: agentes.clienteId })
      .from(agentes)
      .where(eq(agentes.id, id))
      .limit(1);
    if (owner.length === 0) throw new Error("Agente não encontrado.");
    targetClienteId = owner[0].clienteId;
  }
  await setAgenteActive(targetClienteId, id, next);
  revalidatePath("/automacoes");
  revalidatePath("/dashboard");
  revalidatePath("/prompts");
}

export type ClienteAlvo = {
  id: number;
  nome: string | null;
  crmTenant: string | null;
};

/** Lista clientes pra picker do superadmin no modal de Nova Automação. */
export async function listClientesParaSuperAction(): Promise<ClienteAlvo[]> {
  await requireSuperadmin(await readSession());
  const rows = await db
    .select({
      id: clientes.id,
      nome: clientes.nome,
      crmTenant: clientes.crmTenant,
    })
    .from(clientes)
    .orderBy(asc(clientes.nome));
  return rows;
}

export type CreateAgenteResult =
  | {
      ok: true;
      id: number;
      clienteId: number;
      n8n:
        | { ok: true; id: string; url: string }
        | { ok: false; error: string };
    }
  | { ok: false; error: string };

/** Cria nova automação. Gate: superadmin (cria pra qualquer tenant). */
export async function createAgenteAction(
  formData: FormData,
): Promise<CreateAgenteResult> {
  await requireSuperadmin(await readSession());

  const clienteId = Number(formData.get("clienteId"));
  if (!Number.isFinite(clienteId) || clienteId <= 0) {
    return { ok: false, error: "Selecione o cliente alvo." };
  }
  const cli = await db
    .select({ id: clientes.id, nome: clientes.nome })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .limit(1);
  if (cli.length === 0) {
    return { ok: false, error: "Cliente alvo não encontrado." };
  }
  const clienteNome = cli[0].nome ?? `Cliente ${clienteId}`;

  function pickStr(name: string): string | null {
    const v = String(formData.get(name) ?? "").trim();
    return v.length === 0 ? null : v;
  }
  function pickNum(name: string, fallback: number): number {
    const raw = String(formData.get(name) ?? "").trim();
    if (raw === "") return fallback;
    const n = Number(raw);
    return Number.isFinite(n) ? n : fallback;
  }

  // Padrão de nome: "SDR <nome do cliente>". Admin pode override no
  // input "Nome" — se vazio, gera automático.
  const nameInput = String(formData.get("name") ?? "").trim();
  const name = nameInput || `SDR ${clienteNome}`;

  // 1) Cria agente no banco (sem idN8n por enquanto)
  let id: number;
  try {
    id = await createAgente(clienteId, {
      name,
      description: pickStr("description"),
      prompt: pickStr("prompt"),
      debounceTime: pickNum("debounceTime", 10),
      maxFollowups: pickNum("maxFollowups", 5),
      humanIntervention: formData.get("humanIntervention") === "on",
      isActive: formData.get("isActive") !== "off",
      voiceGender: pickStr("voiceGender"),
      idN8n: null,
    });
  } catch (e) {
    // Log full no server — quero TODOS os campos do erro postgres-js
    // (code, detail, constraint, table, column) pra diagnosticar
    // causa raiz da falha de insert.
    console.error("[createAgenteAction] insert falhou. Error obj:", e);
    if (e && typeof e === "object") {
      const fields = [
        "code",
        "detail",
        "hint",
        "constraint",
        "table",
        "column",
        "dataType",
        "schema",
        "where",
      ] as const;
      const dump: Record<string, unknown> = {};
      for (const k of fields) {
        const v = (e as Record<string, unknown>)[k];
        if (v !== undefined) dump[k] = v;
      }
      console.error("[createAgenteAction] postgres fields:", dump);
    }
    const errObj = e as Record<string, unknown> | undefined;
    const msg = e instanceof Error ? e.message : String(e);
    const detail = errObj?.detail ? String(errObj.detail) : "";
    const constraint = errObj?.constraint ? String(errObj.constraint) : "";
    const code = errObj?.code ? String(errObj.code) : "";
    const extras = [code && `[${code}]`, constraint, detail]
      .filter(Boolean)
      .join(" · ");
    return {
      ok: false,
      error: `Erro ao criar automação: ${msg}${extras ? ` · ${extras.slice(0, 240)}` : ""}`,
    };
  }

  // 2) Duplica o workflow pai no n8n e grava idN8n. Falhas aqui não
  //    derrubam a criação — voltam como warning na resposta.
  const n8nResult = await duplicateParentWorkflow(name);
  if (n8nResult.ok) {
    await db
      .update(agentes)
      .set({ idN8n: n8nResult.id })
      .where(and(eq(agentes.id, id), eq(agentes.clienteId, clienteId)));
  }

  revalidatePath("/automacoes");
  revalidatePath("/dashboard");
  revalidatePath("/prompts");
  return { ok: true, id, clienteId, n8n: n8nResult };
}

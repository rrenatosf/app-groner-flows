"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { automacoes, clientes, type Loja } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import {
  validateDadosConfiguracoes as validateDadosConfiguracoesPure,
  type DadosConfigGroup,
} from "./dados-config-shape";

// ----------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------

export type EditableAutomacaoKey =
  | "nome"
  | "descricao"
  | "baseUrl"
  | "n8nWorkflowId"
  | "versao"
  | "isActive"
  | "lojaId";

const TEXT_KEYS: ReadonlySet<EditableAutomacaoKey> = new Set([
  "nome",
  "descricao",
  "baseUrl",
  "n8nWorkflowId",
  "versao",
  "lojaId",
]);
const BOOL_KEYS: ReadonlySet<EditableAutomacaoKey> = new Set(["isActive"]);

export type UpdateAutomacaoPartial = {
  [K in EditableAutomacaoKey]?: string | boolean | null;
};

type Ok = { ok: true };
type Err = { ok: false; error: string };

// ----------------------------------------------------------------
// Auth helper
// ----------------------------------------------------------------

async function loadAndAuthorize(
  automacaoId: number,
): Promise<
  | { ok: true; automacao: typeof automacoes.$inferSelect; isSuper: boolean }
  | Err
> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor só pode visualizar." };
  }
  const isSuper = await isSuperadminFresh(session);
  const automacao = await db.query.automacoes.findFirst({
    where: eq(automacoes.id, automacaoId),
  });
  if (!automacao) return { ok: false, error: "Automação não encontrada." };
  if (!isSuper && automacao.clienteId !== session.clienteId) {
    return {
      ok: false,
      error: "Sem permissão pra editar esta automação.",
    };
  }
  return { ok: true, automacao, isSuper };
}

// ----------------------------------------------------------------
// Coerce / normalização de células
// ----------------------------------------------------------------

function coerceCell(
  key: EditableAutomacaoKey,
  value: string | boolean | null,
): { ok: true; v: unknown } | Err {
  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: `Campo ${key}: texto inválido.` };
    }
    const v = typeof value === "string" ? value.trim() : null;
    // nome e lojaId são obrigatórios — não permitem null/vazio
    if ((key === "nome" || key === "lojaId") && (v === null || v === "")) {
      return { ok: false, error: `Campo ${key}: obrigatório.` };
    }
    return { ok: true, v: v === "" ? null : v };
  }
  if (BOOL_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      return { ok: false, error: `Campo ${key}: booleano inválido.` };
    }
    return { ok: true, v: value };
  }
  return { ok: false, error: `Campo ${key}: não editável.` };
}

/** Verifica se um lojaId pertence ao cliente em questão. Caso a
 *  loja não exista, retorna erro. */
async function assertLojaPertenceAoCliente(
  clienteId: number,
  lojaId: string,
): Promise<Ok | Err> {
  const cli = await db
    .select({ lojas: clientes.lojas })
    .from(clientes)
    .where(eq(clientes.id, clienteId))
    .limit(1);
  if (cli.length === 0) {
    return { ok: false, error: "Cliente não encontrado." };
  }
  const lojas: Loja[] = Array.isArray(cli[0].lojas)
    ? (cli[0].lojas as Loja[])
    : [];
  if (!lojas.some((l) => l.id === lojaId)) {
    return { ok: false, error: "Loja não pertence ao cliente." };
  }
  return { ok: true };
}

// ----------------------------------------------------------------
// Update célula única (edit inline)
// ----------------------------------------------------------------

export async function updateAutomacaoCell(
  automacaoId: number,
  key: EditableAutomacaoKey,
  value: string | boolean | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(automacaoId);
  if (!auth.ok) return auth;
  const coerced = coerceCell(key, value);
  if (!coerced.ok) return coerced;

  // Se editou lojaId, garante que a loja pertence ao mesmo cliente.
  if (key === "lojaId" && typeof coerced.v === "string") {
    const ok = await assertLojaPertenceAoCliente(
      auth.automacao.clienteId,
      coerced.v,
    );
    if (!ok.ok) return ok;
  }

  await db
    .update(automacoes)
    .set({ [key]: coerced.v })
    .where(eq(automacoes.id, automacaoId));
  revalidatePath("/automacoes");
  revalidatePath(`/clientes/${auth.automacao.clienteId}/automacoes`);
  revalidatePath(
    `/clientes/${auth.automacao.clienteId}/lojas/${auth.automacao.lojaId}/automacoes`,
  );
  return { ok: true };
}

// ----------------------------------------------------------------
// Update múltiplos campos (modal)
// ----------------------------------------------------------------

export async function updateAutomacaoFields(
  automacaoId: number,
  patch: UpdateAutomacaoPartial,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(automacaoId);
  if (!auth.ok) return auth;
  const writable: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const key = k as EditableAutomacaoKey;
    const coerced = coerceCell(key, raw ?? null);
    if (!coerced.ok) return coerced;
    writable[key] = coerced.v;
  }
  if (Object.keys(writable).length === 0) return { ok: true };

  // Se mudou lojaId, valida pertencimento.
  if (
    typeof writable.lojaId === "string" &&
    writable.lojaId !== auth.automacao.lojaId
  ) {
    const ok = await assertLojaPertenceAoCliente(
      auth.automacao.clienteId,
      writable.lojaId,
    );
    if (!ok.ok) return ok;
  }

  await db
    .update(automacoes)
    .set(writable)
    .where(eq(automacoes.id, automacaoId));
  revalidatePath("/automacoes");
  revalidatePath(`/clientes/${auth.automacao.clienteId}/automacoes`);
  revalidatePath(
    `/clientes/${auth.automacao.clienteId}/lojas/${auth.automacao.lojaId}/automacoes`,
  );
  return { ok: true };
}

// ----------------------------------------------------------------
// Update dados_configuracoes (jsonb com validação de shape)
// ----------------------------------------------------------------

export async function updateAutomacaoConfiguracoes(
  automacaoId: number,
  raw: unknown,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(automacaoId);
  if (!auth.ok) return auth;
  const valid = validateDadosConfiguracoesPure(raw);
  if (!valid.ok) return valid;
  await db
    .update(automacoes)
    .set({ dadosConfiguracoes: valid.v })
    .where(eq(automacoes.id, automacaoId));
  revalidatePath("/automacoes");
  revalidatePath(`/clientes/${auth.automacao.clienteId}/automacoes`);
  revalidatePath(
    `/clientes/${auth.automacao.clienteId}/lojas/${auth.automacao.lojaId}/automacoes`,
  );
  return { ok: true };
}

// ----------------------------------------------------------------
// Create
// ----------------------------------------------------------------

export type CreateAutomacaoInput = {
  clienteId: number;
  lojaId: string;
  nome: string;
  descricao?: string | null;
  baseUrl?: string | null;
  n8nWorkflowId?: string | null;
  versao?: string | null;
  isActive?: boolean;
  dadosConfiguracoes?: DadosConfigGroup[];
};

export async function createAutomacao(
  input: CreateAutomacaoInput,
): Promise<{ ok: true; id: number } | Err> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor não pode criar automação." };
  }
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper && input.clienteId !== session.clienteId) {
    return {
      ok: false,
      error: "Sem permissão pra criar automação neste cliente.",
    };
  }
  const nome = (input.nome ?? "").trim();
  if (nome.length === 0) return { ok: false, error: "Nome é obrigatório." };

  const lojaId = (input.lojaId ?? "").trim();
  if (lojaId.length === 0) {
    return { ok: false, error: "Loja é obrigatória." };
  }
  const lojaCheck = await assertLojaPertenceAoCliente(
    input.clienteId,
    lojaId,
  );
  if (!lojaCheck.ok) return lojaCheck;

  // Validação opcional de dados_configuracoes (default []).
  let dadosConfig: DadosConfigGroup[] = [];
  if (input.dadosConfiguracoes !== undefined) {
    const v = validateDadosConfiguracoesPure(input.dadosConfiguracoes);
    if (!v.ok) return v;
    dadosConfig = v.v;
  }

  const [created] = await db
    .insert(automacoes)
    .values({
      clienteId: input.clienteId,
      lojaId,
      nome,
      descricao: input.descricao?.trim() || null,
      baseUrl: input.baseUrl?.trim() || null,
      n8nWorkflowId: input.n8nWorkflowId?.trim() || null,
      versao: input.versao?.trim() || null,
      isActive: input.isActive ?? true,
      dadosConfiguracoes: dadosConfig,
    })
    .returning({ id: automacoes.id });
  revalidatePath("/automacoes");
  revalidatePath(`/clientes/${input.clienteId}/automacoes`);
  revalidatePath(`/clientes/${input.clienteId}/lojas/${lojaId}/automacoes`);
  return { ok: true, id: created.id };
}

// ----------------------------------------------------------------
// Delete
// ----------------------------------------------------------------

export async function deleteAutomacao(
  automacaoId: number,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorize(automacaoId);
  if (!auth.ok) return auth;
  const { clienteId, lojaId } = auth.automacao;
  await db.delete(automacoes).where(eq(automacoes.id, automacaoId));
  revalidatePath("/automacoes");
  revalidatePath(`/clientes/${clienteId}/automacoes`);
  revalidatePath(`/clientes/${clienteId}/lojas/${lojaId}/automacoes`);
  return { ok: true };
}

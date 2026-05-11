"use server";

import { count, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import {
  automacoes,
  clientes,
  clientesAutomacoes,
  type Loja,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import {
  validateDadosConfiguracoes as validateDadosConfiguracoesPure,
  validateSnakeCaseKeys,
  type DadosConfigGroup,
} from "./dados-config-shape";

// ----------------------------------------------------------------
// Tipos
// ----------------------------------------------------------------

/** Catálogo: campos editáveis na linha de `automacoes` (super-only). */
export type EditableCatalogoKey =
  | "nome"
  | "descricao"
  | "baseUrl"
  | "n8nWorkflowId"
  | "versao"
  | "isActive";

const CATALOGO_TEXT_KEYS: ReadonlySet<EditableCatalogoKey> = new Set([
  "nome",
  "descricao",
  "baseUrl",
  "n8nWorkflowId",
  "versao",
]);
const CATALOGO_BOOL_KEYS: ReadonlySet<EditableCatalogoKey> = new Set([
  "isActive",
]);

export type UpdateCatalogoAutomacaoPartial = {
  [K in EditableCatalogoKey]?: string | boolean | null;
};

export type CreateCatalogoAutomacaoInput = {
  nome: string;
  descricao?: string | null;
  baseUrl?: string | null;
  n8nWorkflowId?: string | null;
  versao?: string | null;
  isActive?: boolean;
  dadosConfiguracoesTemplate?: DadosConfigGroup[];
  dadosComentarios?: Record<string, string>;
};

/** Instância: campos editáveis em `cliente_automacoes`. */
export type EditableInstanciaKey = "lojaId" | "isActive";

const INSTANCIA_TEXT_KEYS: ReadonlySet<EditableInstanciaKey> = new Set([
  "lojaId",
]);
const INSTANCIA_BOOL_KEYS: ReadonlySet<EditableInstanciaKey> = new Set([
  "isActive",
]);

export type UpdateClienteAutomacaoPartial = {
  [K in EditableInstanciaKey]?: string | boolean | null;
};

export type AssignAutomacaoToClienteInput = {
  automacaoId: number;
  clienteId: number;
  lojaId: string;
  /** Se ausente, copia template do catálogo. */
  dadosConfiguracoes?: DadosConfigGroup[];
  isActive?: boolean;
};

type Ok = { ok: true };
type Err = { ok: false; error: string };

// ----------------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------------

async function requireSuper(): Promise<
  | { ok: true; clienteId: number }
  | Err
> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor não pode editar automações." };
  }
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper) {
    return { ok: false, error: "Apenas superadmin pode editar o catálogo." };
  }
  return { ok: true, clienteId: session.clienteId };
}

async function loadAndAuthorizeInstancia(
  instanciaId: number,
): Promise<
  | {
      ok: true;
      instancia: typeof clientesAutomacoes.$inferSelect;
      isSuper: boolean;
    }
  | Err
> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor só pode visualizar." };
  }
  const isSuper = await isSuperadminFresh(session);
  const instancia = await db.query.clientesAutomacoes.findFirst({
    where: eq(clientesAutomacoes.id, instanciaId),
  });
  if (!instancia) return { ok: false, error: "Instância não encontrada." };
  if (!isSuper && instancia.clienteId !== session.clienteId) {
    return {
      ok: false,
      error: "Sem permissão pra editar esta automação.",
    };
  }
  return { ok: true, instancia, isSuper };
}

// ----------------------------------------------------------------
// Coerce / normalização de células
// ----------------------------------------------------------------

function coerceCatalogoCell(
  key: EditableCatalogoKey,
  value: string | boolean | null,
): { ok: true; v: unknown } | Err {
  if (CATALOGO_TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: `Campo ${key}: texto inválido.` };
    }
    const v = typeof value === "string" ? value.trim() : null;
    if (key === "nome" && (v === null || v === "")) {
      return { ok: false, error: `Campo ${key}: obrigatório.` };
    }
    return { ok: true, v: v === "" ? null : v };
  }
  if (CATALOGO_BOOL_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      return { ok: false, error: `Campo ${key}: booleano inválido.` };
    }
    return { ok: true, v: value };
  }
  return { ok: false, error: `Campo ${key}: não editável.` };
}

function coerceInstanciaCell(
  key: EditableInstanciaKey,
  value: string | boolean | null,
): { ok: true; v: unknown } | Err {
  if (INSTANCIA_TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: `Campo ${key}: texto inválido.` };
    }
    const v = typeof value === "string" ? value.trim() : null;
    if (key === "lojaId" && (v === null || v === "")) {
      return { ok: false, error: `Campo ${key}: obrigatório.` };
    }
    return { ok: true, v };
  }
  if (INSTANCIA_BOOL_KEYS.has(key)) {
    if (typeof value !== "boolean") {
      return { ok: false, error: `Campo ${key}: booleano inválido.` };
    }
    return { ok: true, v: value };
  }
  return { ok: false, error: `Campo ${key}: não editável.` };
}

/** Verifica se um lojaId pertence ao cliente em questão. */
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

function revalidateCatalogo() {
  revalidatePath("/automacoes");
  // Catálogo é mostrado read-only nos modals de instância (baseUrl,
  // workflow, versao). Editar catálogo deve invalidar páginas dos
  // clientes também — `layout` cobre toda a árvore /clientes/[id]/...
  revalidatePath("/clientes", "layout");
  revalidatePath("/flows");
}

function revalidateInstancia(clienteId: number, lojaId: string) {
  revalidatePath("/automacoes");
  revalidatePath(`/clientes/${clienteId}/automacoes`);
  revalidatePath(`/clientes/${clienteId}/lojas/${lojaId}/automacoes`);
  revalidatePath("/flows");
}

/** Mapeia erros Postgres conhecidos para mensagens humanas. Retorna
 *  `null` se não reconhecer (caller deve re-throw). */
function mapPgError(e: unknown): string | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("clientes_automacoes_unique")) {
    return "Esta automação já está atribuída a essa loja. Edite a instância existente em vez de criar outra.";
  }
  if (msg.includes("automacoes_nome_versao_unique")) {
    return "Já existe um catálogo com esse nome e versão.";
  }
  if (msg.includes("foreign key constraint") && msg.includes("clientes_automacoes_automacao_id")) {
    return "Não dá pra apagar — existem clientes usando essa automação. Desative em vez de apagar.";
  }
  return null;
}

// ================================================================
// CATÁLOGO (super-only)
// ================================================================

export async function createCatalogoAutomacao(
  input: CreateCatalogoAutomacaoInput,
): Promise<{ ok: true; id: number } | Err> {
  const auth = await requireSuper();
  if (!auth.ok) return auth;

  const nome = (input.nome ?? "").trim();
  if (nome.length === 0) return { ok: false, error: "Nome é obrigatório." };

  let template: DadosConfigGroup[] = [];
  if (input.dadosConfiguracoesTemplate !== undefined) {
    const v = validateDadosConfiguracoesPure(input.dadosConfiguracoesTemplate);
    if (!v.ok) return v;
    const sk = validateSnakeCaseKeys(v.v);
    if (!sk.ok) return sk;
    template = v.v;
  }

  const comentarios = sanitizeComentarios(input.dadosComentarios);

  try {
    const [created] = await db
      .insert(automacoes)
      .values({
        nome,
        descricao: input.descricao?.trim() || null,
        baseUrl: input.baseUrl?.trim() || null,
        n8nWorkflowId: input.n8nWorkflowId?.trim() || null,
        versao: input.versao?.trim() || null,
        isActive: input.isActive ?? true,
        dadosConfiguracoesTemplate: template,
        dadosComentarios: comentarios,
      })
      .returning({ id: automacoes.id });
    revalidateCatalogo();
    return { ok: true, id: created.id };
  } catch (e) {
    const human = mapPgError(e);
    if (human) return { ok: false, error: human };
    throw e;
  }
}

export async function updateCatalogoAutomacaoFields(
  automacaoId: number,
  patch: UpdateCatalogoAutomacaoPartial,
): Promise<Ok | Err> {
  const auth = await requireSuper();
  if (!auth.ok) return auth;

  const existing = await db.query.automacoes.findFirst({
    where: eq(automacoes.id, automacaoId),
  });
  if (!existing) return { ok: false, error: "Automação não encontrada." };

  const writable: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const key = k as EditableCatalogoKey;
    const coerced = coerceCatalogoCell(key, raw ?? null);
    if (!coerced.ok) return coerced;
    writable[key] = coerced.v;
  }
  if (Object.keys(writable).length === 0) return { ok: true };

  await db
    .update(automacoes)
    .set(writable)
    .where(eq(automacoes.id, automacaoId));
  revalidateCatalogo();
  return { ok: true };
}

export async function updateCatalogoAutomacaoCell(
  automacaoId: number,
  key: EditableCatalogoKey,
  value: string | boolean | null,
): Promise<Ok | Err> {
  const auth = await requireSuper();
  if (!auth.ok) return auth;

  const existing = await db.query.automacoes.findFirst({
    where: eq(automacoes.id, automacaoId),
  });
  if (!existing) return { ok: false, error: "Automação não encontrada." };

  const coerced = coerceCatalogoCell(key, value);
  if (!coerced.ok) return coerced;

  await db
    .update(automacoes)
    .set({ [key]: coerced.v })
    .where(eq(automacoes.id, automacaoId));
  revalidateCatalogo();
  return { ok: true };
}

export async function updateTemplateConfiguracoes(
  automacaoId: number,
  template: unknown,
  comentarios?: unknown,
): Promise<Ok | Err> {
  const auth = await requireSuper();
  if (!auth.ok) return auth;

  const existing = await db.query.automacoes.findFirst({
    where: eq(automacoes.id, automacaoId),
  });
  if (!existing) return { ok: false, error: "Automação não encontrada." };

  const valid = validateDadosConfiguracoesPure(template);
  if (!valid.ok) return valid;
  const sk = validateSnakeCaseKeys(valid.v);
  if (!sk.ok) return sk;

  const writable: Record<string, unknown> = {
    dadosConfiguracoesTemplate: valid.v,
  };
  if (comentarios !== undefined) {
    writable.dadosComentarios = sanitizeComentarios(comentarios);
  }

  await db
    .update(automacoes)
    .set(writable)
    .where(eq(automacoes.id, automacaoId));
  revalidateCatalogo();
  return { ok: true };
}

/** Coage entrada arbitrária em `Record<string, string>`. Aceita só chaves
 *  string com valor string não-vazio. Vazio/null/undefined → ignorado.
 *  Limita tamanho por valor pra evitar payload absurdo. */
const MAX_COMENTARIO_LEN = 500;
function sanitizeComentarios(raw: unknown): Record<string, string> {
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof k !== "string" || k.trim() === "") continue;
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed === "") continue;
    out[k] = trimmed.slice(0, MAX_COMENTARIO_LEN);
  }
  return out;
}

export async function deleteCatalogoAutomacao(
  automacaoId: number,
): Promise<Ok | Err> {
  const auth = await requireSuper();
  if (!auth.ok) return auth;

  const existing = await db.query.automacoes.findFirst({
    where: eq(automacoes.id, automacaoId),
  });
  if (!existing) return { ok: false, error: "Automação não encontrada." };

  const [c] = await db
    .select({ n: count() })
    .from(clientesAutomacoes)
    .where(eq(clientesAutomacoes.automacaoId, automacaoId));
  const n = Number(c?.n ?? 0);
  if (n > 0) {
    return {
      ok: false,
      error: `${n} cliente${n === 1 ? "" : "s"} ainda usa${n === 1 ? "" : "m"} essa automação. Desative em vez de apagar.`,
    };
  }

  try {
    await db.delete(automacoes).where(eq(automacoes.id, automacaoId));
    revalidateCatalogo();
    return { ok: true };
  } catch (e) {
    // Race rara: instância criada entre check e delete. FK RESTRICT pega.
    const human = mapPgError(e);
    if (human) return { ok: false, error: human };
    throw e;
  }
}

// ================================================================
// INSTÂNCIA (super OR cliente-admin do tenant)
// ================================================================

export async function assignAutomacaoToCliente(
  input: AssignAutomacaoToClienteInput,
): Promise<{ ok: true; id: number } | Err> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  if (session.kind === "usuario") {
    return { ok: false, error: "Vendedor não pode atribuir automações." };
  }
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper && input.clienteId !== session.clienteId) {
    return {
      ok: false,
      error: "Sem permissão pra atribuir automação neste cliente.",
    };
  }

  const lojaId = (input.lojaId ?? "").trim();
  if (lojaId.length === 0) {
    return { ok: false, error: "Loja é obrigatória." };
  }
  const lojaCheck = await assertLojaPertenceAoCliente(input.clienteId, lojaId);
  if (!lojaCheck.ok) return lojaCheck;

  const catalogo = await db.query.automacoes.findFirst({
    where: eq(automacoes.id, input.automacaoId),
  });
  if (!catalogo) {
    return { ok: false, error: "Automação do catálogo não encontrada." };
  }

  let dadosConfig: DadosConfigGroup[];
  if (input.dadosConfiguracoes !== undefined) {
    const v = validateDadosConfiguracoesPure(input.dadosConfiguracoes);
    if (!v.ok) return v;
    dadosConfig = v.v;
  } else {
    // Copia profunda (JSON parse/stringify) do template — mutações
    // futuras na instância não afetam catálogo.
    dadosConfig = JSON.parse(
      JSON.stringify(catalogo.dadosConfiguracoesTemplate ?? []),
    ) as DadosConfigGroup[];
  }

  try {
    const [created] = await db
      .insert(clientesAutomacoes)
      .values({
        automacaoId: input.automacaoId,
        clienteId: input.clienteId,
        lojaId,
        dadosConfiguracoes: dadosConfig,
        isActive: input.isActive ?? true,
      })
      .returning({ id: clientesAutomacoes.id });
    revalidateInstancia(input.clienteId, lojaId);
    return { ok: true, id: created.id };
  } catch (e) {
    const human = mapPgError(e);
    if (human) return { ok: false, error: human };
    throw e;
  }
}

export async function updateClienteAutomacaoFields(
  instanciaId: number,
  patch: UpdateClienteAutomacaoPartial,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorizeInstancia(instanciaId);
  if (!auth.ok) return auth;

  const writable: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const key = k as EditableInstanciaKey;
    const coerced = coerceInstanciaCell(key, raw ?? null);
    if (!coerced.ok) return coerced;
    writable[key] = coerced.v;
  }
  if (Object.keys(writable).length === 0) return { ok: true };

  if (
    typeof writable.lojaId === "string" &&
    writable.lojaId !== auth.instancia.lojaId
  ) {
    const ok = await assertLojaPertenceAoCliente(
      auth.instancia.clienteId,
      writable.lojaId,
    );
    if (!ok.ok) return ok;
  }

  try {
    await db
      .update(clientesAutomacoes)
      .set(writable)
      .where(eq(clientesAutomacoes.id, instanciaId));
    revalidateInstancia(auth.instancia.clienteId, auth.instancia.lojaId);
    return { ok: true };
  } catch (e) {
    const human = mapPgError(e);
    if (human) return { ok: false, error: human };
    throw e;
  }
}

export async function updateClienteAutomacaoCell(
  instanciaId: number,
  key: EditableInstanciaKey,
  value: string | boolean | null,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorizeInstancia(instanciaId);
  if (!auth.ok) return auth;

  const coerced = coerceInstanciaCell(key, value);
  if (!coerced.ok) return coerced;

  if (key === "lojaId" && typeof coerced.v === "string") {
    const ok = await assertLojaPertenceAoCliente(
      auth.instancia.clienteId,
      coerced.v,
    );
    if (!ok.ok) return ok;
  }

  try {
    await db
      .update(clientesAutomacoes)
      .set({ [key]: coerced.v })
      .where(eq(clientesAutomacoes.id, instanciaId));
    revalidateInstancia(auth.instancia.clienteId, auth.instancia.lojaId);
    return { ok: true };
  } catch (e) {
    const human = mapPgError(e);
    if (human) return { ok: false, error: human };
    throw e;
  }
}

export async function updateClienteAutomacaoConfiguracoes(
  instanciaId: number,
  configuracoes: unknown,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorizeInstancia(instanciaId);
  if (!auth.ok) return auth;

  const valid = validateDadosConfiguracoesPure(configuracoes);
  if (!valid.ok) return valid;

  await db
    .update(clientesAutomacoes)
    .set({ dadosConfiguracoes: valid.v })
    .where(eq(clientesAutomacoes.id, instanciaId));
  revalidateInstancia(auth.instancia.clienteId, auth.instancia.lojaId);
  return { ok: true };
}

export async function removeClienteAutomacao(
  instanciaId: number,
): Promise<Ok | Err> {
  const auth = await loadAndAuthorizeInstancia(instanciaId);
  if (!auth.ok) return auth;

  const { clienteId, lojaId } = auth.instancia;
  await db
    .delete(clientesAutomacoes)
    .where(eq(clientesAutomacoes.id, instanciaId));
  revalidateInstancia(clienteId, lojaId);
  return { ok: true };
}

"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db/client";
import { clientes, type CrmStatusSlot } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";

export type CreateClienteInput = {
  nome: string;
  email?: string | null;
  telefone?: string | null;
  senha?: string | null;
  crmTenant?: string | null;
  apiInstanciaNome?: string | null;
  apiBaseUrl?: string | null;
  apiToken?: string | null;
  crmToken?: string | null;
  crmOrigemId?: string | null;
  isActive?: boolean;
  isSuperadmin?: boolean;
};

function nullable(s: string | null | undefined): string | null {
  if (s === null || s === undefined) return null;
  const t = s.trim();
  return t === "" ? null : t;
}

/** Server action: verifica senha do super atual sem persistir nada.
 *  Usado pra gate em UI antes mesmo de salvar (ex: clicar checkbox
 *  isSuperadmin no modal). */
export async function verifySuperPasswordAction(
  password: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper) return { ok: false, error: "Apenas superadmin." };
  return verifyActorSuperPassword(session.clienteId, password);
}

/** Compara a senha fornecida com o hash do super (cliente) que está
 *  atuando. Usado pra gates de privilege escalation (ex: ativar
 *  isSuperadmin de outro cliente). */
async function verifyActorSuperPassword(
  actorClienteId: number,
  candidate: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (typeof candidate !== "string" || candidate.length === 0) {
    return { ok: false, error: "Senha do superadmin é obrigatória." };
  }
  const actor = await db.query.clientes.findFirst({
    where: eq(clientes.id, actorClienteId),
  });
  if (!actor || !actor.senha) {
    return {
      ok: false,
      error:
        "Senha do superadmin atual não está configurada — defina antes de ativar superadmin em outro cliente.",
    };
  }
  const match = await bcrypt.compare(candidate, actor.senha);
  if (!match) return { ok: false, error: "Senha incorreta." };
  return { ok: true };
}

export type UpdateClientePartial = {
  [K in EditableKey]?: string | boolean | null;
} & {
  /** Slots canônicos de status do CRM (jsonb). Super-only. */
  crmStatusColunas?: CrmStatusSlot[];
};

/** Update batch para o modal de edição. Valida cada key (super-only
 *  pra senha/tokens/flags). Senha vem em plaintext e é hasheada aqui.
 *  `confirmPassword`: necessário se patch tocar `isSuperadmin`. */
export async function updateClienteFields(
  id: number,
  patch: UpdateClientePartial,
  confirmPassword?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };
  const isSuper = await isSuperadminFresh(session);
  if (!isSuper && id !== session.clienteId) {
    return { ok: false, error: "Sem permissão pra editar este cliente." };
  }

  // Gate: mexer em isSuperadmin exige confirmação por senha.
  if (Object.prototype.hasOwnProperty.call(patch, "isSuperadmin")) {
    const verify = await verifyActorSuperPassword(
      session.clienteId,
      confirmPassword,
    );
    if (!verify.ok) return verify;
  }

  const writable: Record<string, unknown> = {};

  // Slots canônicos do CRM (super-only).
  if (isSuper && Array.isArray(patch.crmStatusColunas)) {
    writable.crmStatusColunas = patch.crmStatusColunas;
  }

  for (const [k, raw] of Object.entries(patch)) {
    if (k === "crmStatusColunas") continue;
    const key = k as EditableKey;
    if (!isSuper && SUPER_ONLY.has(key)) continue;

    if (TEXT_KEYS.has(key)) {
      if (typeof raw !== "string" && raw !== null && raw !== undefined) {
        return { ok: false, error: `Valor de ${key} deve ser texto.` };
      }
      const v =
        raw === null || raw === undefined
          ? null
          : String(raw).trim() === ""
            ? null
            : String(raw).trim();
      if (key === "senha") {
        if (v === null) {
          // não sobrescreve senha vazia — pula
          continue;
        }
        if (v.length < 6) {
          return {
            ok: false,
            error: "Senha deve ter pelo menos 6 caracteres.",
          };
        }
        writable[key] = await bcrypt.hash(v, 10);
      } else {
        writable[key] = v;
      }
    } else {
      if (typeof raw !== "boolean") continue;
      writable[key] = raw;
    }
  }

  if (Object.keys(writable).length === 0) {
    return { ok: true };
  }

  await db.update(clientes).set(writable).where(eq(clientes.id, id));
  // Revalida tanto a lista quanto a página de drilldown deste cliente.
  // Tabs irmãs (lojas/vendedores/leads) compartilham o layout `[id]`
  // mas o cache é por segmento — `revalidatePath("/clientes/[id]/dados", "page")`
  // só invalida a aba Dados; layout segue cacheado entre navegações.
  revalidatePath("/clientes");
  revalidatePath("/clientes/[id]/dados", "page");
  return { ok: true };
}

export async function createCliente(
  input: CreateClienteInput,
  confirmPassword?: string,
): Promise<{ ok: true; id: number } | { ok: false; error: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };

  const isSuper = await isSuperadminFresh(session);
  if (!isSuper) return { ok: false, error: "Apenas superadmin pode criar clientes." };

  // Privilege escalation: criar com isSuperadmin=true exige senha do super.
  if (input.isSuperadmin === true) {
    const verify = await verifyActorSuperPassword(
      session.clienteId,
      confirmPassword,
    );
    if (!verify.ok) return verify;
  }

  const nome = (input.nome ?? "").trim();
  if (nome.length === 0) return { ok: false, error: "Nome é obrigatório." };

  const senhaPlain = nullable(input.senha);
  let senhaHash: string | null = null;
  if (senhaPlain !== null) {
    if (senhaPlain.length < 6) {
      return { ok: false, error: "Senha deve ter pelo menos 6 caracteres." };
    }
    senhaHash = await bcrypt.hash(senhaPlain, 10);
  }

  const [created] = await db
    .insert(clientes)
    .values({
      nome,
      email: nullable(input.email),
      telefone: nullable(input.telefone),
      senha: senhaHash,
      crmTenant: nullable(input.crmTenant),
      apiInstanciaNome: nullable(input.apiInstanciaNome),
      apiBaseUrl: nullable(input.apiBaseUrl),
      apiToken: nullable(input.apiToken),
      crmToken: nullable(input.crmToken),
      crmOrigemId: nullable(input.crmOrigemId),
      isActive: input.isActive ?? true,
      isSuperadmin: input.isSuperadmin ?? false,
      // lojas/vendedores: omitidos — schema default = []
    })
    .returning({ id: clientes.id });

  revalidatePath("/clientes");
  return { ok: true, id: created.id };
}

export type EditableKey =
  | "nome"
  | "email"
  | "telefone"
  | "senha"
  | "crmTenant"
  | "apiInstanciaNome"
  | "apiBaseUrl"
  | "apiToken"
  | "crmToken"
  | "crmOrigemId"
  | "isActive"
  | "isSuperadmin";

const SUPER_ONLY: ReadonlySet<EditableKey> = new Set([
  "apiToken",
  "crmToken",
  "senha",
  "isSuperadmin",
  "isActive",
]);

const TEXT_KEYS: ReadonlySet<EditableKey> = new Set([
  "nome",
  "email",
  "telefone",
  "senha",
  "crmTenant",
  "apiInstanciaNome",
  "apiBaseUrl",
  "apiToken",
  "crmToken",
  "crmOrigemId",
]);

export async function updateClienteCell(
  id: number,
  key: EditableKey,
  value: string | boolean | null,
  confirmPassword?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Sessão expirada." };

  const isSuper = await isSuperadminFresh(session);

  if (!isSuper && id !== session.clienteId) {
    return { ok: false, error: "Sem permissão pra editar este cliente." };
  }
  if (!isSuper && SUPER_ONLY.has(key)) {
    return { ok: false, error: "Campo restrito ao superadmin." };
  }

  // Privilege escalation: alterar isSuperadmin exige senha do super atual.
  if (key === "isSuperadmin") {
    const verify = await verifyActorSuperPassword(
      session.clienteId,
      confirmPassword,
    );
    if (!verify.ok) return verify;
  }

  const patch: Record<string, unknown> = {};
  if (TEXT_KEYS.has(key)) {
    if (typeof value !== "string" && value !== null) {
      return { ok: false, error: "Valor deve ser texto." };
    }
    const v = typeof value === "string" ? value.trim() : null;
    if (key === "senha") {
      // Senha sempre vai pro banco como bcrypt hash. Login usa
      // bcrypt.compare; salvar plaintext quebraria a autenticação.
      if (v === null || v === "") {
        patch[key] = null;
      } else {
        if (v.length < 6) {
          return { ok: false, error: "Senha deve ter pelo menos 6 caracteres." };
        }
        patch[key] = await bcrypt.hash(v, 10);
      }
    } else {
      patch[key] = v === "" ? null : v;
    }
  } else {
    if (typeof value !== "boolean") {
      return { ok: false, error: "Valor deve ser booleano." };
    }
    patch[key] = value;
  }

  await db.update(clientes).set(patch).where(eq(clientes.id, id));
  revalidatePath("/clientes");
  return { ok: true };
}

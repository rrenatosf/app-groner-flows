import "server-only";
import bcrypt from "bcryptjs";
import { eq, sql as s } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes, type Vendedor } from "@/lib/db/schema";
import type { SessionPayload } from "./session";

export type LoginInput = {
  subdomain: string;
  email: string;
  password: string;
};

export type LoginError =
  | "TENANT_NOT_FOUND"
  | "TENANT_INACTIVE"
  | "INVALID_CREDENTIALS"
  | "USER_INACTIVE"
  | "MISSING_PASSWORD";

export type LoginResult =
  | { ok: true; session: SessionPayload }
  | { ok: false; error: LoginError };

async function passwordMatches(
  input: string,
  stored: string | null,
): Promise<boolean> {
  if (!stored) return false;
  if (stored.startsWith("$2")) return bcrypt.compare(input, stored);
  // Fallback temporário pra senhas legadas em texto puro. Pendente:
  // migration que faz bcrypt em todas as senhas existentes (fix
  // Notion "Migrar senhas legadas pra bcrypt"). Remover este fallback
  // assim que migration rodar.
  return input === stored;
}

export async function loginWithSubdomain(
  input: LoginInput,
): Promise<LoginResult> {
  const tenant = input.subdomain.trim().toLowerCase();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!password) return { ok: false, error: "MISSING_PASSWORD" };

  const cliente = await db.query.clientes.findFirst({
    where: eq(s`lower(${clientes.crmTenant})`, tenant),
  });

  if (!cliente) return { ok: false, error: "TENANT_NOT_FOUND" };
  if (cliente.isActive === false) {
    return { ok: false, error: "TENANT_INACTIVE" };
  }

  // 1) Tenta login como cliente (admin do tenant)
  if (cliente.email && cliente.email.toLowerCase() === email) {
    if (await passwordMatches(password, cliente.senha)) {
      return {
        ok: true,
        session: {
          kind: "cliente",
          userId: cliente.id,
          clienteId: cliente.id,
          tenant,
          email,
          name: cliente.nome ?? null,
        },
      };
    }
  }

  // 2) Tenta login dentro do array de vendedores em clientes.vendedores
  const vendedores: Vendedor[] = Array.isArray(cliente.vendedores)
    ? (cliente.vendedores as Vendedor[])
    : [];
  const vendedor = vendedores.find(
    (v) => (v.email ?? "").toLowerCase() === email,
  );

  if (!vendedor) return { ok: false, error: "INVALID_CREDENTIALS" };
  if (vendedor.is_active === false) {
    return { ok: false, error: "USER_INACTIVE" };
  }
  if (!(await passwordMatches(password, vendedor.senha))) {
    return { ok: false, error: "INVALID_CREDENTIALS" };
  }

  // role=owner ganha permissões de admin do tenant
  const sessionKind: "cliente" | "usuario" =
    vendedor.role === "owner" ? "cliente" : "usuario";

  return {
    ok: true,
    session: {
      kind: sessionKind,
      userId: vendedor.id,
      clienteId: cliente.id,
      tenant,
      email,
      name: vendedor.nome ?? null,
    },
  };
}

export const LOGIN_ERROR_MESSAGES: Record<LoginError, string> = {
  TENANT_NOT_FOUND: "Subdomínio não encontrado.",
  TENANT_INACTIVE: "Cliente desativado. Fale com o suporte.",
  INVALID_CREDENTIALS: "E-mail ou senha incorretos.",
  USER_INACTIVE: "Usuário desativado. Fale com o gestor.",
  MISSING_PASSWORD: "Informe a senha.",
};

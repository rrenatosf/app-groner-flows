"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { loginWithSubdomain, LOGIN_ERROR_MESSAGES } from "@/lib/auth/login";
import { createSession } from "@/lib/auth/session";

export type FlowsLoginState = {
  error?: string;
  values?: { subdomain: string; email: string };
};

/**
 * Login dedicado pra superadmin Groner. Aceita apenas conta com
 * `clientes.is_superadmin = true`. Não-super é recusado com mensagem
 * pedindo pra usar /login (rota do cliente comum).
 */
export async function flowsLoginAction(
  _prev: FlowsLoginState,
  formData: FormData,
): Promise<FlowsLoginState> {
  const subdomain = String(formData.get("subdomain") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!subdomain || !email || !password) {
    return {
      error: "Preencha subdomínio, e-mail e senha.",
      values: { subdomain, email },
    };
  }

  const result = await loginWithSubdomain({ subdomain, email, password });
  if (!result.ok) {
    return {
      error: LOGIN_ERROR_MESSAGES[result.error],
      values: { subdomain, email },
    };
  }

  // Gate fresh do banco — só super entra. Vendedor (kind=usuario) e
  // owner não-super são bloqueados sem criar sessão.
  let isSuper = false;
  if (result.session.kind === "cliente") {
    const r = await db
      .select({ isSuperadmin: clientes.isSuperadmin })
      .from(clientes)
      .where(eq(clientes.id, result.session.clienteId))
      .limit(1);
    isSuper = r[0]?.isSuperadmin === true;
  }
  if (!isSuper) {
    // Mensagem genérica — não confirma se a conta existe nem aponta
    // outra rota. Atacante não consegue distinguir credencial errada
    // de conta sem privilégio.
    return {
      error: "E-mail ou senha incorretos.",
      values: { subdomain, email },
    };
  }

  await createSession(result.session);
  redirect("/flows");
}

"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { loginWithSubdomain, LOGIN_ERROR_MESSAGES } from "@/lib/auth/login";
import { createSession } from "@/lib/auth/session";

export type LoginActionState = {
  error?: string;
  values?: { subdomain: string; email: string };
};

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
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

  // Bloqueia superadmin no /login do cliente. Super só entra via
  // /flows/login. Não criamos sessão pra evitar vazamento de cookie.
  if (result.session.kind === "cliente") {
    const r = await db
      .select({ isSuperadmin: clientes.isSuperadmin })
      .from(clientes)
      .where(eq(clientes.id, result.session.clienteId))
      .limit(1);
    if (r[0]?.isSuperadmin === true) {
      // Mensagem genérica: não revela que existe outra rota pra essa
      // conta. Atacante não consegue distinguir credencial errada de
      // conta com privilégio diferente. O time Groner sabe a rota.
      return {
        error: "E-mail ou senha incorretos.",
        values: { subdomain, email },
      };
    }
  }

  await createSession(result.session);
  redirect("/dashboard");
}

import Link from "next/link";
import { eq } from "drizzle-orm";
import { readSession } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { LogoutButton } from "./logout-button";
import { Sidebar } from "./sidebar";
import { DebugPanel } from "./debug-toggle";
import { DebugProvider } from "@/lib/debug/context";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const session = await readSession();

  // is_superadmin lido fresco do DB (não do JWT) — JWT pode estar stale e
  // não querer revogar permissão de tenant exige re-login. Custo: 1 query
  // extra por render do shell (cacheado na request via React cache).
  let isSuperadminFresh = false;
  if (session?.kind === "cliente") {
    const c = await db
      .select({ isSuperadmin: clientes.isSuperadmin })
      .from(clientes)
      .where(eq(clientes.id, session.clienteId))
      .limit(1);
    isSuperadminFresh = c[0]?.isSuperadmin === true;
  }

  const sidebarUser = session
    ? {
        name: session.name,
        email: session.email,
        kind: session.kind,
        tenant: session.tenant,
        isSuperadmin: isSuperadminFresh,
      }
    : null;

  const debugAvailable = sidebarUser?.isSuperadmin === true;

  return (
    <DebugProvider available={debugAvailable}>
    <div className="flex min-h-screen">
      <Sidebar user={sidebarUser} />
      <div className="flex-1 flex flex-col">
        <header
          className="sticky top-0 z-20 backdrop-blur-md"
          style={{
            backgroundColor: "color-mix(in oklab, var(--ink-1) 78%, transparent)",
            borderBottom: "1px solid var(--b-soft)",
          }}
        >
          <div className="px-7 py-3.5 flex items-center justify-between">
            <div className="flex items-center gap-3 text-[12.5px]">
              <span className="text-[color:var(--fg-subtle)]">tenant</span>
              <span className="numerics text-[color:var(--mint-300)]">
                {session?.tenant ?? "—"}
              </span>
              <span className="text-[color:var(--fg-disabled)]">/</span>
              <span className="text-[color:var(--fg-muted)]">
                {session?.kind === "cliente" ? "admin" : "usuário"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/perfil"
                className="text-[13px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition-colors"
              >
                {session?.name ?? session?.email}
              </Link>
              <LogoutButton />
            </div>
          </div>
        </header>
        <main className="flex-1">{children}</main>
      </div>
      <DebugPanel />
    </div>
    </DebugProvider>
  );
}

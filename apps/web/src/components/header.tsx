import Link from "next/link";
import { readSession } from "@/lib/auth/session";
import { LogoutButton } from "./logout-button";

export async function Header() {
  const session = await readSession();

  return (
    <header className="border-b border-[color:var(--b-base)] bg-[color:var(--ink-1)]/80 backdrop-blur sticky top-0 z-30">
      <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <span className="inline-block size-7 rounded-md bg-[color:var(--mint-400)]" />
          <span className="font-semibold tracking-tight text-[color:var(--fg)]">
            Groner <span className="text-[color:var(--mint-300)]">Flows</span>
          </span>
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          {session ? (
            <>
              <span className="text-[color:var(--fg-muted)] hidden sm:inline">
                {session.tenant} · {session.kind === "cliente" ? "Cliente" : "Vendedor"}
              </span>
              <Link
                href="/dashboard"
                className="text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] transition-colors"
              >
                Dashboard
              </Link>
              <LogoutButton />
            </>
          ) : (
            <Link
              href="/login"
              className="btn-primary"
            >
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}

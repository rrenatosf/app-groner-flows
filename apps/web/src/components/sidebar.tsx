"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { DebugToggle } from "./debug-toggle";

type SidebarProps = {
  user: {
    name: string | null;
    email: string;
    kind: "cliente" | "usuario";
    tenant: string;
    isSuperadmin: boolean;
  } | null;
};

type Item = {
  href: string;
  label: string;
  /** Visível só pra kind=cliente (admin do tenant). */
  adminOnly?: boolean;
  /** Visível só pra superadmin Groner. */
  superOnly?: boolean;
  /** Esconde do superadmin (consolidado em "Clientes"). */
  hideForSuper?: boolean;
};

// Superadmin tem sidebar enxuta — Lojas/Usuários/Configurações foram
// consolidados dentro do modal de Clientes (área Flows).
const items: Item[] = [
  { href: "/flows", label: "Flows", superOnly: true },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/clientes", label: "Clientes", adminOnly: true },
  { href: "/lojas", label: "Lojas" },
  {
    href: "/usuarios",
    label: "Usuários",
    adminOnly: true,
  },
  { href: "/agentes", label: "Agentes" },
  { href: "/automacoes", label: "Automações", superOnly: true },
  { href: "/leads", label: "Leads" },
  { href: "/agendamentos", label: "Agendamentos" },
  { href: "/prompts", label: "Prompts" },
];

function initials(name: string | null, email: string): string {
  const source = (name && name.trim()) || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  return (
    <aside
      className="w-64 shrink-0 hidden md:flex flex-col"
      style={{
        backgroundColor: "var(--ink-2)",
        borderRight: "1px solid var(--b-soft)",
      }}
    >
      <div className="px-6 pt-6 pb-7">
        <Link href="/dashboard" className="flex items-center gap-3 group">
          <Image
            src="/assets/brand/groner-logo.png"
            alt="Groner"
            width={34}
            height={34}
            priority
            className="rounded-[10px] ring-1 ring-[color:var(--b-base)]"
          />
          <div className="leading-tight">
            <div className="text-[15px] font-semibold tracking-tight text-[color:var(--fg)]">
              Groner
            </div>
            <div className="serif italic text-[15px] -mt-[2px] text-[color:var(--mint-300)]">
              Flows
            </div>
          </div>
        </Link>
      </div>

      <div className="px-4">
        <div className="label-eyebrow px-2 mb-2">Workspace</div>
      </div>

      <nav className="px-3 flex-1">
        <ul className="space-y-0.5">
          {items
            .filter((it) => {
              const isSuper = user?.isSuperadmin === true;
              if (it.superOnly) return isSuper;
              if (it.hideForSuper && isSuper) return false;
              if (it.adminOnly) return user?.kind === "cliente";
              return true;
            })
            .map((it) => {
            const active =
              pathname === it.href ||
              (it.href !== "/dashboard" && pathname?.startsWith(it.href));
            return (
              <li key={it.href}>
                <Link
                  href={it.href}
                  className={cn(
                    "relative flex items-center gap-3 rounded-[10px] px-3 py-[9px] text-[13.5px] transition-all duration-150",
                    active
                      ? "text-[color:var(--fg)]"
                      : "text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]",
                  )}
                  style={
                    active ? { backgroundColor: "var(--ink-3)" } : undefined
                  }
                >
                  {active && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1.5 bottom-1.5 w-[2px] rounded-r-full"
                      style={{
                        background:
                          "linear-gradient(180deg, var(--mint-300), var(--mint-500))",
                      }}
                    />
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      "size-1.5 rounded-full transition-colors",
                      active
                        ? "bg-[color:var(--mint-300)]"
                        : "bg-[color:var(--ink-5)]",
                    )}
                  />
                  <span>{it.label}</span>
                </Link>
              </li>
            );
            })}
        </ul>
      </nav>

      {user && (
        <div className="p-3 mt-2">
          <Link
            href="/perfil"
            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-[color:var(--ink-3)]"
            style={{ border: "1px solid var(--b-soft)" }}
          >
            <span
              aria-hidden
              className="size-9 rounded-full flex items-center justify-center text-[11px] font-semibold tracking-wider"
              style={{
                background:
                  "linear-gradient(135deg, var(--ink-4), var(--ink-2))",
                color: "var(--fg)",
                border: "1px solid var(--b-base)",
              }}
            >
              {initials(user.name, user.email)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-medium text-[color:var(--fg)] truncate">
                {user.name ?? user.email}
              </span>
              <span className="block text-[11px] text-[color:var(--fg-subtle)] truncate numerics">
                {user.kind === "cliente" ? "admin" : "usuário"} · {user.tenant}
              </span>
            </span>
          </Link>
          {user.isSuperadmin && (
            <div className="mt-2 flex items-center pl-1">
              <DebugToggle />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

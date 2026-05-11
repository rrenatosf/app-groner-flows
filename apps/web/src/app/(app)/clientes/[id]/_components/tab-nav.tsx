"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type TabItem = {
  /** Path absoluto da rota (ex: "/clientes/123/dados"). */
  href: string;
  label: string;
  /** Quando true, marca como ativo só se `pathname === href` exatamente.
   *  Útil pra abas-índice que viraram pais de sub-rotas (ex: aba "Lista
   *  de agentes" não deve ficar ativa quando user está em sub-rota
   *  irmã como "/agentes/vendedores"). */
  exactMatch?: boolean;
};

/**
 * Tab nav client component. Usa `usePathname` pra marcar a aba ativa.
 * `<Link>` com prefetch (default) — navegação client-side, segmentos
 * adjacentes mantém cache de layout (clientes/[id]/layout.tsx) intacto.
 */
export function TabNav({ tabs }: { tabs: TabItem[] }) {
  const pathname = usePathname();

  return (
    <div
      className="px-7 flex items-center gap-1 flex-wrap"
      style={{ borderBottom: "1px solid var(--b-soft)" }}
      role="tablist"
      aria-label="Seções do cliente"
    >
      {tabs.map((tab) => {
        // Match por prefixo — uma sub-rota como /clientes/1/lojas/abc
        // ainda destaca a aba "Lojas". Override `exactMatch` desliga
        // o prefixo (necessário pra abas-índice).
        const isActive = tab.exactMatch
          ? pathname === tab.href
          : pathname === tab.href ||
            pathname.startsWith(tab.href + "/");
        return (
          <Link
            key={tab.href}
            href={tab.href}
            role="tab"
            aria-selected={isActive}
            className="text-[12.5px] px-3 py-2 rounded-t-md transition-colors"
            style={{
              color: isActive ? "var(--fg)" : "var(--fg-muted)",
              backgroundColor: isActive ? "var(--ink-2)" : "transparent",
              borderTop: isActive ? "1px solid var(--b-soft)" : "1px solid transparent",
              borderLeft: isActive ? "1px solid var(--b-soft)" : "1px solid transparent",
              borderRight: isActive ? "1px solid var(--b-soft)" : "1px solid transparent",
              borderBottom: isActive
                ? "1px solid var(--ink-2)"
                : "1px solid transparent",
              marginBottom: "-1px",
            }}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

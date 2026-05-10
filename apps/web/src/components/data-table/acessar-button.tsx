"use client";

import Link from "next/link";

/** Botão "Acessar →" da coluna `acoes` — drilldown only.
 *  Visual mint sutil. `prefetch={false}` por default pra não warmup
 *  N rotas só por scroll/paginação — pode ser sobrescrito via prop.
 *  `e.stopPropagation()` evita disparar o `setSelected` da célula. */
export function AcessarButton({
  href,
  ariaLabel,
  prefetch = false,
}: {
  href: string;
  ariaLabel: string;
  prefetch?: boolean;
}) {
  return (
    <Link
      href={href}
      prefetch={prefetch}
      onClick={(e) => e.stopPropagation()}
      aria-label={ariaLabel}
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] transition-colors hover:bg-[color:var(--ink-4)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--mint-300)]"
      style={{ color: "var(--mint-200)", border: "1px solid transparent" }}
    >
      <span>Acessar</span>
      <span aria-hidden>→</span>
    </Link>
  );
}

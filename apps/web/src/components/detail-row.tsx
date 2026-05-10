"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Wrapper de <tr> que abre o modal de detalhes ao clicar na linha.
 * Componentes editáveis dentro da linha (lápis, switches, selects, botões
 * de delete) devem chamar e.stopPropagation() em seus handlers para não
 * disparar o open.
 */
export function DetailRow({
  detailId,
  children,
  className,
}: {
  detailId: string | number;
  children: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function open() {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("detail", String(detailId));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <tr
      onClick={open}
      className={`cursor-pointer ${className ?? ""}`.trim()}
    >
      {children}
    </tr>
  );
}

"use client";

import Link from "next/link";

/** Chip "Abrir" usado ao lado da propriedade principal de cada linha
 *  (nome do cliente, nome da automação, nome do agente, etc). Padrão
 *  unificado pra "abrir detalhe" — pode ir pra uma `page` (href) OU
 *  abrir um modal (onClick).
 *
 *  Visual: chip mint discreto. `e.stopPropagation()` evita disparar
 *  seleção da célula.
 *
 *  Posicionamento: `floatRight` ancora o chip no lado extremo direito
 *  da célula (absolute). Requer que a `<td>` pai tenha
 *  `position: relative`. Sem isso, o chip flutua junto do conteúdo —
 *  útil quando a célula tem largura fixa ou só esse elemento. */
export function AbrirChip({
  href,
  onClick,
  ariaLabel,
  title = "Abrir",
  floatRight = false,
}: {
  /** Quando informado, vira `<Link>` pra navegação client-side. */
  href?: string;
  /** Quando informado (sem href), vira `<button>` que dispara modal. */
  onClick?: () => void;
  ariaLabel: string;
  title?: string;
  /** Posiciona o chip absolutamente na borda direita da célula
   *  (mantém alinhamento entre linhas independentemente do tamanho do
   *  conteúdo principal). */
  floatRight?: boolean;
}) {
  const baseClass =
    "chip chip-mint text-[10.5px] px-1.5 py-0.5 transition-colors whitespace-nowrap shrink-0";
  const positionClass = floatRight
    ? "absolute right-3 top-1/2 -translate-y-1/2"
    : "ml-auto";
  const className = `${baseClass} ${positionClass}`;

  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        onClick={(e) => e.stopPropagation()}
        aria-label={ariaLabel}
        title={title}
        className={className}
      >
        Abrir
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick?.();
      }}
      aria-label={ariaLabel}
      title={title}
      className={className}
    >
      Abrir
    </button>
  );
}

import Link from "next/link";

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

/**
 * Breadcrumb server component pro drilldown cliente → loja → vendedor.
 * Apenas markup; o caller monta a lista. Renderiza acima do tab-nav.
 */
export function Breadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="px-7 pt-5 text-[12px] text-[color:var(--fg-subtle)] flex items-center gap-1.5 flex-wrap"
    >
      {items.map((item, idx) => {
        const isLast = idx === items.length - 1;
        return (
          <span key={`${idx}-${item.label}`} className="flex items-center gap-1.5">
            {item.href && !isLast ? (
              <Link
                href={item.href}
                className="hover:text-[color:var(--fg)] transition-colors"
                style={{ color: "var(--fg-muted)" }}
              >
                {item.label}
              </Link>
            ) : (
              <span style={{ color: isLast ? "var(--fg)" : "var(--fg-muted)" }}>
                {item.label}
              </span>
            )}
            {!isLast && (
              <span aria-hidden style={{ color: "var(--fg-subtle)" }}>
                ›
              </span>
            )}
          </span>
        );
      })}
    </nav>
  );
}

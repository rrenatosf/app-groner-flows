"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect } from "react";

export function DetailModal({
  title,
  subtitle,
  children,
  footer,
  eyebrow,
  prevId,
  nextId,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  eyebrow?: string;
  /** ID do item anterior na mesma listagem. null/undefined desabilita seta ←. */
  prevId?: string | number | null;
  /** ID do próximo item. null/undefined desabilita seta →. */
  nextId?: string | number | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function close() {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("detail");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  function goTo(id: string | number) {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("detail", String(id));
    router.replace(`${pathname}?${next.toString()}`);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft" && prevId !== null && prevId !== undefined) {
        goTo(prevId);
      } else if (
        e.key === "ArrowRight" &&
        nextId !== null &&
        nextId !== undefined
      ) {
        goTo(nextId);
      }
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="detail-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8 fade-in"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={close}
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "rgba(4, 18, 13, 0.66)" }}
      />
      <div
        className="relative w-full max-w-[80vw] max-h-[85vh] flex flex-col rounded-2xl scale-in"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-7 pt-6 pb-5"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            {eyebrow && (
              <div className="flex items-center gap-2 mb-1.5">
                <span className="label-eyebrow">{eyebrow}</span>
                {(prevId !== undefined || nextId !== undefined) && (
                  <span className="inline-flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => prevId !== null && prevId !== undefined && goTo(prevId)}
                      disabled={prevId === null || prevId === undefined}
                      className="size-5 rounded-md flex items-center justify-center text-[10px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:hover:text-[color:var(--fg-muted)]"
                      style={{ border: "1px solid var(--b-soft)" }}
                      title="Anterior (←)"
                      aria-label="Anterior"
                    >
                      ◂
                    </button>
                    <button
                      type="button"
                      onClick={() => nextId !== null && nextId !== undefined && goTo(nextId)}
                      disabled={nextId === null || nextId === undefined}
                      className="size-5 rounded-md flex items-center justify-center text-[10px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:hover:text-[color:var(--fg-muted)]"
                      style={{ border: "1px solid var(--b-soft)" }}
                      title="Próximo (→)"
                      aria-label="Próximo"
                    >
                      ▸
                    </button>
                  </span>
                )}
              </div>
            )}
            <h2
              id="detail-modal-title"
              className="serif text-[26px] leading-tight text-[color:var(--fg)]"
            >
              {title}
            </h2>
            {subtitle && (
              <p className="text-[13px] text-[color:var(--fg-muted)] mt-1.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={close}
            className="size-8 rounded-lg flex items-center justify-center text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--ink-3)] transition-colors"
            aria-label="Fechar"
            style={{ border: "1px solid var(--b-soft)" }}
          >
            ✕
          </button>
        </header>
        <div className="flex-1 overflow-auto px-7 py-6">{children}</div>
        {footer && (
          <footer
            className="px-7 py-4 flex items-center justify-end gap-3"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}

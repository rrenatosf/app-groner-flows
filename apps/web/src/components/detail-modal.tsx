"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect } from "react";
import { ModalShell } from "./modal-shell";

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
      if (e.key === "ArrowLeft" && prevId !== null && prevId !== undefined) {
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
    return () => {
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prevId, nextId]);

  return (
    <ModalShell
      open={true}
      onClose={close}
      // Eyebrow accepts string only — fallback to provided eyebrow
      eyebrow={eyebrow}
      title={title}
      size="full"
      isDirty={false}
      footer={footer}
      ariaLabel={title}
    >
      <div className="px-7 py-6">
        {(prevId !== undefined || nextId !== undefined) && (
          <div className="flex items-center gap-0.5 mb-3">
            <button
              type="button"
              onClick={() =>
                prevId !== null && prevId !== undefined && goTo(prevId)
              }
              disabled={prevId === null || prevId === undefined}
              className="size-6 rounded-md flex items-center justify-center text-[11px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:hover:text-[color:var(--fg-muted)]"
              style={{ border: "1px solid var(--b-soft)" }}
              title="Anterior (←)"
              aria-label="Anterior"
            >
              ◂
            </button>
            <button
              type="button"
              onClick={() =>
                nextId !== null && nextId !== undefined && goTo(nextId)
              }
              disabled={nextId === null || nextId === undefined}
              className="size-6 rounded-md flex items-center justify-center text-[11px] text-[color:var(--fg-muted)] hover:text-[color:var(--mint-300)] disabled:opacity-30 disabled:hover:text-[color:var(--fg-muted)]"
              style={{ border: "1px solid var(--b-soft)" }}
              title="Próximo (→)"
              aria-label="Próximo"
            >
              ▸
            </button>
          </div>
        )}
        {subtitle && (
          <p className="text-[13px] text-[color:var(--fg-muted)] mb-4">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </ModalShell>
  );
}

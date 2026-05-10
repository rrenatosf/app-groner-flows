"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function SearchBox({
  placeholder = "Buscar...",
  paramName = "q",
  compact = false,
}: {
  placeholder?: string;
  paramName?: string;
  /** Variante enxuta — combina com botões de toolbar (text-[12px] px-2.5 py-1). */
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = params.get(paramName) ?? "";
  const [value, setValue] = useState(initial);
  const [prevInitial, setPrevInitial] = useState(initial);
  const [isPending, startTransition] = useTransition();

  // React 19: derivar do prop durante render em vez de sincronizar via
  // useEffect. Quando o querystring muda externamente (ex: navegação), o
  // input reflete sem efeito colateral.
  if (prevInitial !== initial) {
    setPrevInitial(initial);
    setValue(initial);
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      const next = new URLSearchParams(Array.from(params.entries()));
      if (value.trim()) next.set(paramName, value.trim());
      else next.delete(paramName);
      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => router.replace(url));
    }, 200);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  if (compact) {
    return (
      <div className="relative w-60">
        <svg
          aria-hidden
          className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: isPending ? "var(--mint-300)" : "var(--fg-subtle)" }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <input
          type="search"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-md text-[12px] py-1 pr-2 focus:outline-none transition-colors"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg)",
            border: isPending
              ? "1px solid var(--mint-300)"
              : "1px solid var(--b-soft)",
            paddingLeft: "26px",
            height: "26px",
          }}
        />
        {isPending && (
          <span
            aria-hidden
            className="absolute right-2 top-1/2 -translate-y-1/2 numerics"
            style={{ fontSize: 10, color: "var(--mint-300)" }}
          >
            filtrando…
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="relative w-72">
      <svg
        aria-hidden
        className="absolute left-3 top-1/2 -translate-y-1/2 size-4 pointer-events-none"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ color: "var(--fg-subtle)" }}
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-[10px] py-[10px] pr-3 text-[13px] focus:outline-none focus:ring-2 transition-colors"
        style={{
          backgroundColor: "var(--ink-2)",
          color: "var(--fg)",
          border: "1px solid var(--b-soft)",
          paddingLeft: "36px",
        }}
      />
    </div>
  );
}

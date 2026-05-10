"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";

/**
 * Picker de tenant pra superadmin filtrar /usuarios cross-tenant.
 * Client Component porque mexe em router via onChange — Server
 * Components não podem receber event handlers.
 */
export function TenantFilter({
  tenants,
  current,
}: {
  tenants: { id: number; nome: string | null; crmTenant: string | null }[];
  current: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function onChange(v: string) {
    const next = new URLSearchParams(Array.from(params.entries()));
    if (v) next.set("cid", v);
    else next.delete("cid");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      defaultValue={current ?? ""}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="text-[12px] px-2.5 py-1.5 rounded-md"
      style={{
        backgroundColor: "var(--ink-2)",
        color: "var(--fg)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <option value="">Todos os tenants</option>
      {tenants.map((t) => (
        <option key={t.id} value={t.id}>
          {t.nome ?? t.crmTenant ?? `#${t.id}`}
        </option>
      ))}
    </select>
  );
}

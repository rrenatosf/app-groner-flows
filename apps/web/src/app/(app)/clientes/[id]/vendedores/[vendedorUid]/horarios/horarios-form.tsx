"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { HorariosVendedor, Vendedor } from "@/lib/db/schema";
import { UsuarioHorariosGrid } from "../../../../../usuarios/usuario-horarios-grid";
import {
  updateVendedorFields,
  type UpdateVendedorPartial,
} from "../../../../../usuarios/actions";

/** Wrapper client component pra aba "Horários". Reusa
 *  <UsuarioHorariosGrid> e salva via updateVendedorFields. Apenas o
 *  campo `horarios` é alterado — outros campos preservam valor atual. */
export function HorariosForm({
  clienteId,
  vendedor,
  canEdit,
}: {
  clienteId: number;
  vendedor: Vendedor;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [horarios, setHorarios] = useState<HorariosVendedor>(
    vendedor.horarios && typeof vendedor.horarios === "object"
      ? { ...vendedor.horarios }
      : {},
  );
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSavedOk(false);
    // Patch só com horarios — preservamos os outros campos atuais.
    const patch: UpdateVendedorPartial = {
      nome: vendedor.nome ?? null,
      email: vendedor.email ?? null,
      telefone: vendedor.telefone ?? null,
      crm_id: vendedor.crm_id ?? null,
      role: vendedor.role,
      is_active: vendedor.is_active,
      recebe_agendamento: vendedor.recebe_agendamento,
      loja_ids: vendedor.loja_ids,
      horarios,
    };
    startTransition(async () => {
      const res = await updateVendedorFields(clienteId, vendedor.uid, patch);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setSavedOk(true);
      router.refresh();
      setTimeout(() => setSavedOk(false), 2500);
    });
  }

  return (
    <form onSubmit={submit} className="p-5 space-y-3">
      {err && (
        <div
          className="px-3 py-2 rounded-md text-[12px]"
          style={{
            backgroundColor: "var(--amber-bg)",
            color: "var(--amber-300)",
            border: "1px solid var(--amber-border)",
          }}
        >
          {err}
        </div>
      )}
      {savedOk && (
        <div
          className="px-3 py-2 rounded-md text-[12px] inline-flex items-center gap-2"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-muted)",
            border: "1px solid var(--b-base)",
          }}
          role="status"
          aria-live="polite"
        >
          <span aria-hidden style={{ color: "var(--mint-300)" }}>✓</span>
          <span>Horários salvos.</span>
        </div>
      )}

      <UsuarioHorariosGrid
        value={horarios}
        onChange={setHorarios}
        disabled={pending || !canEdit}
      />

      {canEdit && (
        <div
          className="flex items-center justify-end pt-3"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="submit"
            disabled={pending}
            className="chip chip-mint text-[12px] px-3 py-1.5"
          >
            {pending ? "Salvando…" : "Salvar horários"}
          </button>
        </div>
      )}
    </form>
  );
}

"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CrmStatusSlots } from "@/components/crm/crm-status-slots";
import { DESQUALIFICADO_SLUGS } from "@/lib/crm/slots";
import {
  updateClienteFields,
  type UpdateClientePartial,
} from "../../../actions";
import type { ClienteRow } from "../../../clientes-table";
import type { CrmStatusSlot, CrmStatusTipo } from "@/lib/db/schema";

/**
 * Form da aba "Colunas CRM" — extraído do cliente-edit-modal (linhas
 * 771-808). Reusa <CrmStatusSlots>, que escreve hidden inputs no form
 * parent. Este wrapper monta o form, lê FormData e envia patch via
 * `updateClienteFields(id, { crmStatusColunas })`.
 */
export function ColunasCrmForm({ cliente }: { cliente: ClienteRow }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState<boolean>(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setSavedOk(false);
    if (!formRef.current) return;

    const fd = new FormData(formRef.current);
    const slotDefs: { slug: string; tipo: CrmStatusTipo; label: string }[] = [
      { slug: "inicial", tipo: "inicial", label: "Status inicial" },
      {
        slug: "qualificado",
        tipo: "qualificacao",
        label: "Status qualificado",
      },
      ...DESQUALIFICADO_SLUGS.map((d) => ({
        slug: d.slug,
        tipo: "desqualificacao" as CrmStatusTipo,
        label: d.labelDefault,
      })),
    ];
    const slots: CrmStatusSlot[] = [];
    let anyFilled = false;
    for (const def of slotDefs) {
      const id = String(fd.get(`id_${def.slug}`) ?? "").trim();
      const nome = String(fd.get(`nome_${def.slug}`) ?? "").trim();
      const etapa_id = String(fd.get(`etapa_id_${def.slug}`) ?? "").trim();
      const etapa_nome = String(fd.get(`etapa_nome_${def.slug}`) ?? "").trim();
      const not_used = String(fd.get(`notused_${def.slug}`) ?? "") === "1";
      if (id || nome || not_used) anyFilled = true;
      slots.push({
        slug: def.slug,
        tipo: def.tipo,
        id,
        nome,
        etapa_id,
        etapa_nome,
        not_used,
      });
    }
    if (!anyFilled) {
      setErr("Configure ao menos um slot antes de salvar.");
      return;
    }
    const patch: UpdateClientePartial = { crmStatusColunas: slots };
    startTransition(async () => {
      const res = await updateClienteFields(cliente.id, patch);
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
    <form ref={formRef} onSubmit={submit} className="p-5 space-y-3">
      <div>
        <p className="text-[12.5px] font-medium text-[color:var(--fg)] mb-1">
          Funis e etapas do CRM
        </p>
        <p className="text-[11.5px] text-[color:var(--fg-subtle)]">
          Cada slot tem nome (livre) + ID (do CRM) + slug (fixo, usado pelo
          backend). Use &quot;Buscar do CRM&quot; abaixo pra preencher
          automaticamente.
        </p>
      </div>

      <CrmStatusSlots
        key={cliente.id}
        colunas={cliente.crmStatusColunas ?? null}
        clienteId={cliente.id}
      />

      <div
        className="rounded-md p-3 text-[11.5px]"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <strong>Estado de origem (CRM Origem):</strong> configurado no campo{" "}
        <code>CRM Origem</code> da aba Dados. ID atual:{" "}
        <span style={{ color: "var(--fg)" }}>
          {cliente.crmOrigemId ?? "(não definido)"}
        </span>
        .
      </div>

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
          <span>Slots salvos.</span>
        </div>
      )}

      <div
        className="flex items-center justify-end gap-2 pt-2"
        style={{ borderTop: "1px solid var(--b-soft)" }}
      >
        <button
          type="submit"
          disabled={pending}
          className="chip chip-mint text-[12px] px-3 py-1.5"
        >
          {pending ? "Salvando…" : "Salvar slots"}
        </button>
      </div>
    </form>
  );
}

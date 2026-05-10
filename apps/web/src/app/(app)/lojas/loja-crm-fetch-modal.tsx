"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchCrmLojasForClienteAction } from "@/server/actions/cliente-crm";
import { updateLojaFields, type UpdateLojaPartial } from "./actions";
import type { LojaRow } from "./lojas-table";
import { IconCheck, IconWarn } from "@/components/data-table";

type CrmLoja = {
  id: string | number | null;
  nome: string | null;
  cnpj: string | null;
  telefone: string | null;
  endereco: string | null;
  endereco_cep: string | null;
  endereco_rua: string | null;
  endereco_bairro: string | null;
  endereco_cidade: string | null;
  endereco_estado: string | null;
  endereco_numero: string | null;
  endereco_complemento: string | null;
};

const FIELD_MAP: {
  key: keyof UpdateLojaPartial;
  label: string;
  fromCrm: (l: CrmLoja) => string | null;
}[] = [
  { key: "nome", label: "Nome", fromCrm: (l) => l.nome },
  { key: "cnpj", label: "CNPJ", fromCrm: (l) => l.cnpj },
  { key: "telefone", label: "Telefone", fromCrm: (l) => l.telefone },
  { key: "endereco", label: "Endereço (legado)", fromCrm: (l) => l.endereco },
  { key: "endereco_cep", label: "CEP", fromCrm: (l) => l.endereco_cep },
  { key: "endereco_rua", label: "Rua", fromCrm: (l) => l.endereco_rua },
  { key: "endereco_numero", label: "Número", fromCrm: (l) => l.endereco_numero },
  { key: "endereco_bairro", label: "Bairro", fromCrm: (l) => l.endereco_bairro },
  { key: "endereco_cidade", label: "Cidade", fromCrm: (l) => l.endereco_cidade },
  { key: "endereco_estado", label: "Estado", fromCrm: (l) => l.endereco_estado },
  { key: "endereco_complemento", label: "Complemento", fromCrm: (l) => l.endereco_complemento },
];

export function LojaCrmFetchModal({
  open,
  target,
  onClose,
}: {
  open: boolean;
  target: LojaRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pendingFetch, startFetch] = useTransition();
  const [pendingApply, startApply] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [crmLoja, setCrmLoja] = useState<CrmLoja | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open || !target) return;
    setCrmLoja(null);
    setSelected(new Set());
    setErr(null);
    if (!target.loja.crm_id) {
      setErr(
        "Esta loja não tem CRM ID configurado — preencha o crm_id antes de buscar.",
      );
      return;
    }
    startFetch(async () => {
      const res = await fetchCrmLojasForClienteAction(target.clienteId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      const found = res.lojas.find(
        (l) => String(l.id ?? "").trim() === String(target.loja.crm_id).trim(),
      );
      if (!found) {
        setErr(
          `Nenhuma loja com crm_id "${target.loja.crm_id}" foi encontrada no CRM deste cliente.`,
        );
        return;
      }
      setCrmLoja({
        id: found.id ?? null,
        nome: found.nome ?? null,
        cnpj: found.cnpj ?? null,
        telefone: found.telefone ?? null,
        endereco: found.endereco ?? null,
        endereco_cep: found.endereco_cep ?? null,
        endereco_rua: found.endereco_rua ?? null,
        endereco_bairro: found.endereco_bairro ?? null,
        endereco_cidade: found.endereco_cidade ?? null,
        endereco_estado: found.endereco_estado ?? null,
        endereco_numero: found.endereco_numero ?? null,
        endereco_complemento: found.endereco_complemento ?? null,
      });
    });
  }, [open, target]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function isEmpty(v: unknown): boolean {
    if (v === null || v === undefined) return true;
    if (typeof v === "string" && v.trim() === "") return true;
    if (typeof v === "number" && v === 0) return false; // numbers válidos
    return false;
  }

  const rows = useMemo(() => {
    if (!target || !crmLoja) return [];
    const lojaRec = target.loja as unknown as Record<string, unknown>;
    return FIELD_MAP.map((f) => {
      const current = lojaRec[f.key as string];
      const crmValue = f.fromCrm(crmLoja);
      const currentEmpty = isEmpty(current);
      const crmHasValue = !isEmpty(crmValue);
      // Aplicável: atual vazio + CRM tem valor.
      const applicable = currentEmpty && crmHasValue;
      return {
        key: f.key as string,
        label: f.label,
        current: current === null || current === undefined ? "" : String(current),
        crmValue: crmValue ?? "",
        applicable,
        currentEmpty,
        crmHasValue,
      };
    });
  }, [target, crmLoja]);

  const applicableRows = rows.filter((r) => r.applicable);
  const allApplicableSelected =
    applicableRows.length > 0 &&
    applicableRows.every((r) => selected.has(r.key));

  function toggleField(k: string) {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setSelected(next);
  }
  function selectAllApplicable() {
    setSelected(new Set(applicableRows.map((r) => r.key)));
  }
  function clearAll() {
    setSelected(new Set());
  }

  function applySelected() {
    if (!target || selected.size === 0) return;
    const patch: UpdateLojaPartial = {};
    for (const r of rows) {
      if (selected.has(r.key) && r.applicable) {
        patch[r.key as keyof UpdateLojaPartial] = r.crmValue;
      }
    }
    if (Object.keys(patch).length === 0) return;
    startApply(async () => {
      const res = await updateLojaFields(
        target.clienteId,
        target.loja.id,
        patch,
      );
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  if (!open || !target) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      style={{
        backgroundColor: "rgba(2,8,5,0.62)",
        backdropFilter: "blur(2px)",
      }}
    >
      <div
        className="w-full max-w-[860px] max-h-[92vh] overflow-y-auto rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-md)",
        }}
      >
        <div
          className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="label-eyebrow">CRM · {target.clienteNome ?? ""}</div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)]">
              Buscar dados de "{target.loja.nome ?? "(sem nome)"}" no CRM
            </h2>
            <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1">
              Atualiza apenas campos vazios — não sobrescreve valores
              já preenchidos.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="text-[16px] text-[color:var(--fg-subtle)] hover:text-[color:var(--fg)]"
          >
            ✕
          </button>
        </div>

        {pendingFetch && (
          <div className="p-5 text-center text-[13px] text-[color:var(--fg-muted)]">
            Buscando dados no CRM…
          </div>
        )}

        {err && (
          <div
            className="px-5 py-2 text-[12px]"
            style={{
              backgroundColor: "var(--amber-bg)",
              color: "var(--amber-300)",
              borderBottom: "1px solid var(--amber-border)",
            }}
          >
            {err}
          </div>
        )}

        {!pendingFetch && crmLoja && (
          <div className="p-5 space-y-3">
            {applicableRows.length === 0 ? (
              <div
                className="rounded-md p-4 text-[13px]"
                style={{
                  backgroundColor: "var(--ink-3)",
                  color: "var(--fg-muted)",
                  border: "1px solid var(--b-base)",
                }}
              >
                <span style={{ color: "var(--mint-300)" }}>✓</span> Nada a aplicar — todos os campos do Groner já estão
                preenchidos. Nenhum dado do CRM seria adicionado sem
                sobrescrever.
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[12px] text-[color:var(--fg-muted)]">
                  {applicableRows.length} campo
                  {applicableRows.length === 1 ? "" : "s"} pode
                  {applicableRows.length === 1 ? "" : "m"} ser
                  preenchido{applicableRows.length === 1 ? "" : "s"} a
                  partir do CRM.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={
                      allApplicableSelected ? clearAll : selectAllApplicable
                    }
                    className="text-[11.5px] px-2 py-1 rounded"
                    style={{
                      backgroundColor: "var(--ink-3)",
                      color: "var(--fg-muted)",
                      border: "1px solid var(--b-soft)",
                    }}
                  >
                    {allApplicableSelected
                      ? "Limpar seleção"
                      : "Aprovar todos"}
                  </button>
                </div>
              </div>
            )}

            <div
              className="rounded-md overflow-hidden"
              style={{ border: "1px solid var(--b-soft)" }}
            >
              <table className="w-full text-[12px]">
                <thead>
                  <tr
                    style={{
                      backgroundColor: "var(--ink-3)",
                      color: "var(--fg-subtle)",
                    }}
                  >
                    <th className="text-left px-3 py-2 font-medium">Campo</th>
                    <th className="text-left px-3 py-2 font-medium">
                      Valor atual no Groner
                    </th>
                    <th className="text-left px-3 py-2 font-medium">
                      Valor no CRM
                    </th>
                    <th
                      className="text-center px-3 py-2 font-medium"
                      style={{ width: "80px" }}
                    >
                      Aplicar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.key}
                      style={{
                        borderTop: "1px solid var(--b-soft)",
                        opacity: r.applicable ? 1 : 0.55,
                      }}
                    >
                      <td className="px-3 py-2 align-top font-medium">
                        {r.label}
                        <div
                          className="text-[10.5px] text-[color:var(--fg-subtle)] numerics"
                          style={{ marginTop: 2 }}
                        >
                          {r.key}
                        </div>
                      </td>
                      <td
                        className="px-3 py-2 align-top text-[color:var(--fg-muted)]"
                        style={{ wordBreak: "break-word" }}
                      >
                        {r.current.trim() === "" ? (
                          <span className="text-[color:var(--fg-disabled)] italic">
                            (vazio)
                          </span>
                        ) : (
                          <span>{r.current}</span>
                        )}
                      </td>
                      <td
                        className="px-3 py-2 align-top"
                        style={{ wordBreak: "break-word" }}
                      >
                        {r.crmValue.trim() === "" ? (
                          <span className="text-[color:var(--fg-disabled)] italic">
                            —
                          </span>
                        ) : (
                          <span style={{ color: "var(--mint-300)" }}>
                            {r.crmValue}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 align-middle text-center">
                        {r.applicable ? (
                          <input
                            type="checkbox"
                            checked={selected.has(r.key)}
                            onChange={() => toggleField(r.key)}
                            className="accent-[color:var(--mint-300)]"
                          />
                        ) : r.currentEmpty ? (
                          <span
                            title="CRM não tem valor"
                            style={{ color: "var(--fg-disabled)" }}
                          >
                            <IconWarn size={14} />
                          </span>
                        ) : (
                          <span
                            title="Já preenchido — não será sobrescrito"
                            style={{ color: "var(--mint-300)" }}
                          >
                            <IconCheck size={14} />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={onClose}
            disabled={pendingApply}
            className="text-[12px] px-3 py-1.5 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={applySelected}
            disabled={pendingApply || selected.size === 0}
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{ opacity: selected.size === 0 ? 0.5 : 1 }}
          >
            {pendingApply
              ? "Aplicando…"
              : `Aplicar ${selected.size > 0 ? `(${selected.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

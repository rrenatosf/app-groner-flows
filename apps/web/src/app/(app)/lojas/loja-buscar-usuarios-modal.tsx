"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fetchCrmUsuariosForClienteAction } from "@/server/actions/cliente-crm";
import { createVendedorTyped } from "../usuarios/actions";
import type { LojaRow } from "./lojas-table";

type CrmUsuario = {
  id: number;
  nome: string;
  email: string | null;
  celular: string | null;
  ativo: boolean;
};

const FIELD_MAPPING: { crm: string; groner: string; desc: string }[] = [
  { crm: "nome", groner: "nome", desc: "Nome do usuário" },
  { crm: "email", groner: "email", desc: "E-mail (login)" },
  { crm: "celular", groner: "telefone", desc: "Telefone" },
  { crm: "ativo", groner: "is_active", desc: "Status ativo/inativo" },
  { crm: "id", groner: "crm_id", desc: "ID no CRM (referência)" },
];

export function LojaBuscarUsuariosModal({
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
  const [pendingImport, startImport] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [usuarios, setUsuarios] = useState<CrmUsuario[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [defaultPassword, setDefaultPassword] = useState("groner123");

  useEffect(() => {
    if (!open || !target) return;
    setUsuarios(null);
    setPicked(new Set());
    setErr(null);
    startFetch(async () => {
      const res = await fetchCrmUsuariosForClienteAction(target.clienteId);
      if (!res.ok) {
        setErr(res.error);
        return;
      }
      setUsuarios(res.usuarios);
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

  function toggle(uid: number) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  }
  const allPicked =
    usuarios !== null &&
    usuarios.length > 0 &&
    usuarios.every((u) => picked.has(u.id));
  function pickAll() {
    if (!usuarios) return;
    setPicked(new Set(usuarios.map((u) => u.id)));
  }
  function clearPicked() {
    setPicked(new Set());
  }

  function importSelected() {
    if (!target || !usuarios || picked.size === 0) return;
    const toImport = usuarios.filter((u) => picked.has(u.id));
    startImport(async () => {
      let success = 0;
      let lastErr: string | null = null;
      for (const u of toImport) {
        const res = await createVendedorTyped(target.clienteId, {
          nome: u.nome,
          email: u.email ?? "",
          telefone: u.celular ?? null,
          senha: defaultPassword,
          role: "vendedor",
          loja_ids: [target.loja.id],
          crm_id: String(u.id),
        });
        if (res.ok) success++;
        else lastErr = res.error;
      }
      if (success > 0) {
        onClose();
        router.refresh();
      } else if (lastErr) {
        setErr(`Falha ao importar: ${lastErr}`);
      }
    });
  }

  const summary = useMemo(() => {
    if (!usuarios) return null;
    return `${usuarios.length} usuário${usuarios.length === 1 ? "" : "s"} no CRM dessa loja.`;
  }, [usuarios]);

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
            <div className="label-eyebrow">CRM</div>
            <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)]">
              Buscar usuários da loja "{target.loja.nome ?? "(sem nome)"}"
            </h2>
            <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1">
              Importa pra tabela de Usuários, vinculados a esta loja.
              Cliente: {target.clienteNome ?? "—"}.
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
            Buscando usuários no CRM…
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

        {!pendingFetch && usuarios && (
          <div className="p-5 space-y-4">
            {/* Mapeamento de campos */}
            <div
              className="rounded-md p-3"
              style={{
                backgroundColor: "var(--ink-3)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <div className="label-eyebrow mb-2">
                Mapeamento de campos
              </div>
              <ul className="space-y-1">
                {FIELD_MAPPING.map((m) => (
                  <li
                    key={m.crm}
                    className="text-[11.5px] grid grid-cols-[100px_20px_120px_1fr] gap-2 items-center"
                  >
                    <span
                      className="numerics"
                      style={{ color: "var(--mint-300)" }}
                    >
                      {m.crm}
                    </span>
                    <span style={{ color: "var(--fg-subtle)" }}>→</span>
                    <span className="numerics">{m.groner}</span>
                    <span style={{ color: "var(--fg-subtle)" }}>{m.desc}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px] text-[color:var(--fg-muted)]">
                {summary}
              </p>
              {usuarios.length > 0 && (
                <button
                  type="button"
                  onClick={allPicked ? clearPicked : pickAll}
                  disabled={pendingImport}
                  className="text-[11.5px] px-2 py-1 rounded"
                  style={{
                    backgroundColor: "var(--ink-3)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--b-soft)",
                  }}
                >
                  {allPicked ? "Limpar seleção" : "Selecionar todos"}
                </button>
              )}
            </div>

            {/* Senha padrão */}
            <label className="flex items-center gap-2">
              <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
                Senha padrão pros importados:
              </span>
              <input
                type="text"
                value={defaultPassword}
                onChange={(e) => setDefaultPassword(e.target.value)}
                disabled={pendingImport}
                className="text-[12.5px] px-2 py-1 rounded"
                style={{
                  backgroundColor: "var(--ink-3)",
                  border: "1px solid var(--b-soft)",
                  color: "var(--fg)",
                  outline: "none",
                  width: "180px",
                }}
              />
            </label>

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
                    <th
                      className="text-center px-2 py-2"
                      style={{ width: 40 }}
                    >
                      Sel.
                    </th>
                    <th className="text-left px-3 py-2">Nome (CRM)</th>
                    <th className="text-left px-3 py-2">E-mail (CRM)</th>
                    <th className="text-left px-3 py-2">Celular (CRM)</th>
                    <th
                      className="text-center px-3 py-2"
                      style={{ width: 70 }}
                    >
                      Ativo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {usuarios.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="text-center px-3 py-6 text-[color:var(--fg-subtle)]"
                      >
                        Nenhum usuário encontrado no CRM.
                      </td>
                    </tr>
                  ) : (
                    usuarios.map((u) => {
                      const isPicked = picked.has(u.id);
                      return (
                        <tr
                          key={u.id}
                          style={{
                            borderTop: "1px solid var(--b-soft)",
                            backgroundColor: isPicked
                              ? "var(--ink-4)"
                              : undefined,
                          }}
                        >
                          <td className="text-center align-middle px-2 py-2">
                            <input
                              type="checkbox"
                              checked={isPicked}
                              onChange={() => toggle(u.id)}
                              disabled={pendingImport}
                              className="accent-[color:var(--mint-300)]"
                            />
                          </td>
                          <td className="px-3 py-2">{u.nome}</td>
                          <td
                            className="px-3 py-2 text-[color:var(--fg-muted)]"
                            style={{ wordBreak: "break-word" }}
                          >
                            {u.email ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-[color:var(--fg-muted)] numerics">
                            {u.celular ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span
                              style={{
                                color: u.ativo
                                  ? "var(--mint-300)"
                                  : "var(--rose-300)",
                              }}
                            >
                              {u.ativo ? "ativo" : "inativo"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
            disabled={pendingImport}
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
            onClick={importSelected}
            disabled={
              pendingImport || picked.size === 0 || !defaultPassword
            }
            className="chip chip-mint text-[12px] px-3 py-1.5"
            style={{
              opacity:
                picked.size === 0 || !defaultPassword ? 0.5 : 1,
            }}
          >
            {pendingImport
              ? "Importando…"
              : `Importar selecionados${picked.size > 0 ? ` (${picked.size})` : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

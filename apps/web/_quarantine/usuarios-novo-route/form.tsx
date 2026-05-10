"use client";

import Link from "next/link";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Field, Toggle } from "@/components/form-field";
import { SaveButton } from "@/components/save-button";
import { createUsuarioAction, type NewUsuarioState } from "./actions";
import {
  fetchCrmUsuariosAction,
  type CrmUsuario,
} from "../../perfil/cliente/actions";
import { HorariosGrid } from "../[id]/editar/horarios-grid";
import type { HorariosVendedor } from "@/lib/db/schema";

const initial: NewUsuarioState = {
  values: {
    nome: "",
    email: "",
    telefone: "",
    crmId: "",
    role: "vendedor",
    recebeAgendamento: true,
  },
};

export function NewUsuarioForm({
  prefill,
}: {
  prefill?: CrmUsuario | null;
} = {}) {
  const [state, action, pending] = useActionState(createUsuarioAction, initial);
  const v = state.values ?? initial.values!;

  // Picker controla os defaults dos campos quando o user seleciona um funcionário do CRM.
  // Se prefill veio da query (cliente abriu via "Buscar do CRM" em /usuarios), usa como
  // valor inicial.
  const [picked, setPicked] = useState<CrmUsuario | null>(prefill ?? null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const horariosInitial: HorariosVendedor = {};

  function applyPick(u: CrmUsuario) {
    setPicked(u);
    setPickerOpen(false);
  }

  return (
    <form action={action} className="grid gap-5 max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-[color:var(--fg-muted)]">
          Cadastro novo. Você pode buscar o funcionário direto no CRM da loja
          para preencher automaticamente.
        </p>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="text-[12px] px-3 py-1.5 rounded-md shrink-0"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--mint-300)",
            border: "1px solid var(--b-soft)",
          }}
        >
          Buscar do CRM
        </button>
      </div>

      {picked && (
        <div
          className="rounded-md p-3 flex items-center gap-3"
          style={{
            backgroundColor: "rgba(70,200,154,0.06)",
            border: "1px solid rgba(70,200,154,0.32)",
          }}
        >
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] text-[color:var(--mint-300)]">
              Carregado do CRM:{" "}
              <strong>{picked.nome}</strong>
              {picked.email ? ` — ${picked.email}` : ""}
            </p>
            <p className="text-[10.5px] text-[color:var(--fg-subtle)] numerics">
              CRM ID #{picked.id}
              {picked.celular ? ` · ${picked.celular}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-[11.5px] px-2 py-1 rounded-md"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-subtle)",
              border: "1px solid var(--b-soft)",
            }}
          >
            Limpar
          </button>
        </div>
      )}
      <fieldset
        className="rounded-md p-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-base)",
        }}
      >
        <legend className="text-[12.5px] font-medium text-[color:var(--fg-muted)] px-2">
          Identidade
        </legend>
        <div
          key={picked ? `crm-${picked.id}` : "manual"}
          className="grid gap-4 sm:grid-cols-2 mt-2"
        >
          <Field
            label="Nome completo"
            name="nome"
            defaultValue={picked?.nome ?? v.nome}
            required
          />
          <Field
            label="E-mail (login)"
            name="email"
            type="email"
            defaultValue={picked?.email ?? v.email}
            required
            hint="Único dentro do tenant. Será usado para login junto com o subdomínio."
          />
          <Field
            label="Telefone"
            name="telefone"
            defaultValue={picked?.celular ?? v.telefone}
          />
          <Field
            label="ID no CRM"
            name="crmId"
            defaultValue={picked ? String(picked.id) : v.crmId}
            hint="ID do vendedor no CRM externo, se houver."
          />
        </div>
      </fieldset>

      <fieldset
        className="rounded-md p-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-base)",
        }}
      >
        <legend className="text-[12.5px] font-medium text-[color:var(--fg-muted)] px-2">
          Acesso
        </legend>

        <div className="grid gap-4 sm:grid-cols-2 mt-2">
          <Field
            label="Senha inicial"
            name="senha"
            type="password"
            required
            hint="Mínimo 6 caracteres. Será gravada como hash bcrypt. Usuário pode trocar depois."
          />
          <label className="block">
            <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
              Nível de acesso
            </span>
            <select
              name="role"
              defaultValue={v.role}
              className="w-full rounded-[10px] py-[10px] px-3 text-[14px]"
              style={{
                backgroundColor: "var(--ink-2)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <option value="vendedor">Usuário (acesso restrito aos próprios leads)</option>
              <option value="owner">Admin (acesso completo, pode editar e cadastrar)</option>
            </select>
            <span className="text-[11.5px] text-[color:var(--fg-subtle)] mt-1.5 block leading-snug">
              Ownership pode ser revogado depois trocando o nível.
            </span>
          </label>
        </div>

        <div className="mt-4">
          <Toggle
            label="Recebe agendamentos"
            name="recebeAgendamento"
            defaultChecked={v.recebeAgendamento}
            hint="Se desligado, vendedor não entra na fila de distribuição automática (continua cadastrado)."
          />
        </div>
      </fieldset>

      <fieldset
        className="rounded-md p-4"
        style={{
          backgroundColor: "var(--ink-3)",
          border: "1px solid var(--b-base)",
        }}
      >
        <legend className="text-[12.5px] font-medium text-[color:var(--fg-muted)] px-2 mb-2">
          Horários de atendimento
        </legend>
        <p className="text-[11.5px] text-[color:var(--fg-subtle)] mb-3 px-2 leading-snug">
          Defina os intervalos em que o usuário atende. Sem nenhum intervalo, o
          usuário fica fora da fila de distribuição. Use os atalhos abaixo
          para preencher um padrão e depois ajuste o que precisar.
        </p>
        <HorariosGrid initial={horariosInitial} />
      </fieldset>

      {state.error && (
        <p
          role="alert"
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "rgba(248,113,113,0.06)",
            border: "1px solid rgba(248,113,113,0.22)",
            color: "#fca5a5",
          }}
        >
          {state.error}
        </p>
      )}

      <div className="flex items-center justify-end gap-3 pt-2">
        <Link
          href="/usuarios"
          className="btn-ghost"
        >
          Cancelar
        </Link>
        <SaveButton>{pending ? "Criando..." : "Criar usuário"}</SaveButton>
      </div>

      {pickerOpen && (
        <CrmUsuariosPicker
          onClose={() => setPickerOpen(false)}
          onPick={applyPick}
        />
      )}
    </form>
  );
}

function CrmUsuariosPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (u: CrmUsuario) => void;
}) {
  const [usuarios, setUsuarios] = useState<CrmUsuario[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    start(async () => {
      const res = await fetchCrmUsuariosAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUsuarios(res.usuarios);
      setLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function refresh() {
    setError(null);
    setLoaded(false);
    start(async () => {
      const res = await fetchCrmUsuariosAction();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setUsuarios(res.usuarios);
      setLoaded(true);
    });
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter((u) => {
      return (
        u.nome.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.celular ?? "").toLowerCase().includes(q) ||
        String(u.id).includes(q)
      );
    });
  }, [usuarios, query]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 backdrop-blur-sm"
        style={{ backgroundColor: "rgba(4,18,13,0.6)" }}
      />
      <div
        className="relative w-full max-w-[640px] rounded-xl flex flex-col max-h-[70vh]"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="flex items-center justify-between gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
              Funcionários ativos no CRM
            </p>
            <p className="text-[14px] font-medium text-[color:var(--fg)]">
              Selecionar para preencher cadastro
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-7 rounded-md flex items-center justify-center text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
            style={{ border: "1px solid var(--b-soft)" }}
            aria-label="Fechar"
          >
            ✕
          </button>
        </header>

        <div className="px-4 pt-3 pb-2">
          <div className="relative">
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
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome, e-mail, celular ou ID..."
              className="w-full rounded-[10px] py-[10px] pl-10 pr-12 text-[13px] focus:outline-none"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            />
            <button
              type="button"
              onClick={refresh}
              disabled={pending}
              title="Atualizar lista"
              className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md flex items-center justify-center text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] disabled:opacity-50"
              aria-label="Atualizar"
            >
              ↻
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2 pb-3">
          {error && (
            <div
              className="mx-2 mb-2 px-3 py-2 text-[12px] rounded-md"
              style={{
                backgroundColor: "rgba(248,113,113,0.06)",
                color: "#fca5a5",
                border: "1px solid rgba(248,113,113,0.22)",
              }}
            >
              {error}
            </div>
          )}
          {pending && !loaded && (
            <div className="px-3 py-4 text-[12.5px] text-[color:var(--fg-subtle)] text-center">
              Buscando funcionários no CRM...
            </div>
          )}
          {loaded && filtered.length === 0 && (
            <div className="px-3 py-4 text-[12.5px] text-[color:var(--fg-subtle)] text-center">
              {query
                ? `Nenhum funcionário corresponde a "${query}".`
                : "CRM não retornou funcionários ativos."}
            </div>
          )}
          {loaded && filtered.length > 0 && (
            <ul className="divide-y" style={{ borderColor: "var(--b-soft)" }}>
              {filtered.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => onPick(u)}
                    className="w-full text-left px-3 py-2 hover:bg-[color:var(--ink-3)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="size-8 rounded-full flex items-center justify-center shrink-0 text-[11px] font-medium"
                        style={{
                          backgroundColor: "var(--ink-3)",
                          color: "var(--fg-muted)",
                          border: "1px solid var(--b-soft)",
                        }}
                      >
                        {u.nome
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((p) => p[0]?.toUpperCase() ?? "")
                          .join("") || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[color:var(--fg)] truncate">
                          {u.nome}
                        </p>
                        <p className="text-[11px] text-[color:var(--fg-subtle)] truncate numerics">
                          {u.email ?? "—"}
                          {u.celular ? ` · ${u.celular}` : ""}
                          {` · #${u.id}`}
                        </p>
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <footer
          className="px-4 py-2.5 text-[11px] text-[color:var(--fg-subtle)] flex items-center justify-between"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <span>
            {loaded ? `${filtered.length} de ${usuarios.length}` : "—"}
          </span>
          <span className="numerics">ESC fecha</span>
        </footer>
      </div>
    </div>
  );
}

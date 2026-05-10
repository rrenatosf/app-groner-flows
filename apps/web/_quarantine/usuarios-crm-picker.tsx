"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fetchCrmUsuariosAction,
  type CrmUsuario,
} from "@/server/actions/cliente-crm";

export function UsuariosCrmPickerButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[12px] px-3 py-1.5 rounded-md"
        style={{
          backgroundColor: "var(--ink-2)",
          color: "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
        }}
      >
        Buscar do CRM
      </button>
      {open && <PickerModal onClose={() => setOpen(false)} />}
    </>
  );
}

function PickerModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
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

  function pick(u: CrmUsuario) {
    const params = new URLSearchParams();
    params.set("nome", u.nome);
    if (u.email) params.set("email", u.email);
    if (u.celular) params.set("celular", u.celular);
    params.set("crmId", String(u.id));
    onClose();
    router.push(`/usuarios/novo?${params.toString()}`);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return usuarios;
    return usuarios.filter(
      (u) =>
        u.nome.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        (u.celular ?? "").toLowerCase().includes(q) ||
        String(u.id).includes(q),
    );
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
              Selecionar para iniciar cadastro
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
              title="Atualizar"
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
                    onClick={() => pick(u)}
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
          <span className="numerics">click pra abrir cadastro</span>
        </footer>
      </div>
    </div>
  );
}

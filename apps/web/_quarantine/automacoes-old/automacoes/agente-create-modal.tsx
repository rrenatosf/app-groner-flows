"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Field, Toggle } from "@/components/form-field";
import {
  createAgenteAction,
  type ClienteAlvo,
} from "./actions";

export function AgenteCreateModal({
  clientes,
}: {
  clientes: ClienteAlvo[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Combobox pesquisável: input controla a busca; selecionado vai pro
  // hidden input clienteId que o submit envia.
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ClienteAlvo | null>(null);
  const [open, setOpen] = useState(false);
  const comboRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (comboRef.current && !comboRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = clientes.filter((c) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.nome ?? "").toLowerCase().includes(q) ||
      (c.crmTenant ?? "").toLowerCase().includes(q) ||
      String(c.id).includes(q)
    );
  });

  function pickCliente(c: ClienteAlvo) {
    setSelected(c);
    setQuery(
      `${c.nome ?? `Cliente #${c.id}`}${c.crmTenant ? ` · ${c.crmTenant}` : ""}`,
    );
    setOpen(false);
  }

  function close() {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.delete("new");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!selected) {
      setError("Selecione o cliente alvo.");
      return;
    }
    const fd = new FormData(e.currentTarget);
    startSave(async () => {
      const r = await createAgenteAction(fd);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Sinaliza falha de duplicação n8n via search param — agente foi
      // criado, mas o admin precisa abrir o n8n manualmente.
      const next = new URLSearchParams();
      next.set("detail", String(r.id));
      if (!r.n8n.ok) {
        next.set("n8nWarn", encodeURIComponent(r.n8n.error));
      }
      router.replace(`${pathname}?${next.toString()}`);
      router.refresh();
    });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 fade-in"
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={close}
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
      />
      <div
        className="relative w-full max-w-[720px] max-h-[92vh] flex flex-col rounded-2xl scale-in"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
      >
        <header
          className="flex items-start justify-between gap-4 px-7 pt-6 pb-4"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <div>
            <div className="label-eyebrow mb-1.5">Marketplace</div>
            <h2 className="serif text-[24px] leading-tight text-[color:var(--fg)]">
              Nova automação
            </h2>
            <p className="text-[12px] text-[color:var(--fg-subtle)] mt-1">
              Cria um agente IA pra um tenant. Defaults aplicados em campos
              opcionais.
            </p>
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

        <form
          onSubmit={submit}
          className="flex-1 overflow-auto px-7 py-6 space-y-5"
        >
          <div className="block" ref={comboRef}>
            <label
              htmlFor="cliente-combo"
              className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5"
            >
              Cliente alvo
            </label>
            <input type="hidden" name="clienteId" value={selected?.id ?? ""} />
            <div className="relative">
              <input
                id="cliente-combo"
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setOpen(true);
                  if (selected) setSelected(null);
                }}
                onFocus={() => setOpen(true)}
                placeholder="Pesquise por nome ou subdomínio..."
                autoComplete="off"
                className="w-full rounded-[10px] py-[10px] px-3 text-[14px]"
                style={{
                  backgroundColor: "var(--ink-3)",
                  color: "var(--fg)",
                  border: selected
                    ? "1px solid rgba(70,200,154,0.32)"
                    : "1px solid var(--b-soft)",
                }}
              />
              {open && (
                <div
                  className="absolute left-0 right-0 mt-1.5 rounded-md z-30 overflow-auto"
                  style={{
                    backgroundColor: "var(--ink-2)",
                    border: "1px solid var(--b-base)",
                    boxShadow: "var(--glow-md)",
                    maxHeight: 280,
                  }}
                >
                  {filtered.length === 0 ? (
                    <p className="px-3 py-3 text-[12px] text-[color:var(--fg-subtle)]">
                      Nenhum cliente corresponde a "{query}".
                    </p>
                  ) : (
                    <ul>
                      {filtered.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => pickCliente(c)}
                            className="w-full text-left px-3 py-2 hover:bg-[color:var(--ink-3)] transition-colors"
                            style={
                              selected?.id === c.id
                                ? {
                                    backgroundColor: "rgba(70,200,154,0.06)",
                                  }
                                : undefined
                            }
                          >
                            <p className="text-[13px] text-[color:var(--fg)]">
                              {c.nome ?? `Cliente #${c.id}`}
                            </p>
                            <p className="text-[11px] text-[color:var(--fg-subtle)] numerics">
                              {c.crmTenant ?? "—"} · #{c.id}
                            </p>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            {selected && (
              <p className="text-[10.5px] text-[color:var(--mint-300)] mt-1">
                ✓ {selected.nome ?? `Cliente #${selected.id}`} selecionado
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Nome"
              name="name"
              hint="Deixe vazio pra gerar 'SDR <cliente>' automático."
            />
            <Field
              label="ID n8n"
              name="idN8n"
              hint="Workflow ID do n8n (opcional, pode preencher depois)."
            />
          </div>

          <Field
            label="Descrição"
            name="description"
            hint="Resumo curto da automação."
          />

          <label className="block">
            <span className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5">
              Prompt
            </span>
            <textarea
              name="prompt"
              rows={6}
              className="w-full rounded-[10px] py-[10px] px-3 text-[13px] font-mono leading-relaxed"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
              placeholder="Descreva o comportamento do agente (pode editar depois)."
            />
          </label>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Debounce (s)"
              name="debounceTime"
              type="number"
              defaultValue="10"
            />
            <Field
              label="Max follow-ups"
              name="maxFollowups"
              type="number"
              defaultValue="5"
            />
            <Field
              label="Voz"
              name="voiceGender"
              hint="masc / fem / null."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Toggle
              name="humanIntervention"
              label="Requer intervenção humana"
              defaultChecked={false}
            />
            <Toggle name="isActive" label="Ativa" defaultChecked={true} />
          </div>

          {error && (
            <p
              className="text-[12.5px] rounded-md px-3 py-2.5"
              style={{
                backgroundColor: "rgba(248,113,113,0.06)",
                border: "1px solid rgba(248,113,113,0.22)",
                color: "#fca5a5",
              }}
            >
              {error}
            </p>
          )}

          <div
            className="flex items-center justify-end gap-2 pt-2"
            style={{ borderTop: "1px solid var(--b-soft)" }}
          >
            <button
              type="button"
              onClick={close}
              disabled={saving}
              className="btn-ghost text-[12.5px]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn-primary disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar automação"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

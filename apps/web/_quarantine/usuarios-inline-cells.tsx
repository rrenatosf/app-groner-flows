"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  updateUsuarioFieldAction,
  removeUsuarioAction,
  getDeletePreviewAction,
} from "./actions";

export function UsuarioRow({
  id,
  children,
}: {
  id: number;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function open() {
    const next = new URLSearchParams(Array.from(params.entries()));
    next.set("detail", String(id));
    router.push(`${pathname}?${next.toString()}`);
  }

  return (
    <tr onClick={open} className="cursor-pointer">
      {children}
    </tr>
  );
}

/** Td cuja propagação de click é interrompida — usado em colunas de ações
 * para evitar abrir o modal ao clicar em botões dentro. */
export function StopPropTd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td className={className} onClick={(e) => e.stopPropagation()}>
      {children}
    </td>
  );
}

export function TextCell({
  id,
  field,
  value,
  placeholder,
  className,
  canEdit,
  type = "text",
}: {
  id: number;
  field: "nome" | "email" | "telefone" | "crmId";
  value: string;
  placeholder?: string;
  className?: string;
  canEdit: boolean;
  type?: "text" | "email";
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const [pending, start] = useTransition();

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("field", field);
      fd.set("value", val);
      try {
        await updateUsuarioFieldAction(fd);
        setEditing(false);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erro ao salvar.");
      }
    });
  }

  if (!canEdit) {
    return (
      <span className={className}>{value || placeholder || "—"}</span>
    );
  }

  if (!editing) {
    return (
      <div className="group inline-flex items-center gap-2">
        <span className={className}>{value || placeholder || "—"}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVal(value ?? "");
            setEditing(true);
          }}
          className="text-[10.5px] text-[color:var(--fg-subtle)] hover:text-[color:var(--mint-300)] opacity-0 group-hover:opacity-100 transition-opacity"
          title={`Editar ${field}`}
          aria-label={`Editar ${field}`}
        >
          ✎
        </button>
      </div>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        autoFocus
        type={type}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          } else if (e.key === "Escape") {
            setEditing(false);
            setVal(value ?? "");
          }
        }}
        disabled={pending}
        className="rounded-[6px] px-2 py-1 text-[12.5px] focus:outline-none w-44"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg)",
          border: "1px solid var(--mint-700)",
        }}
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          save();
        }}
        disabled={pending}
        className="text-[10.5px] px-1.5 py-0.5 rounded text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)] disabled:opacity-50"
        title="Salvar (Enter)"
      >
        {pending ? "..." : "✓"}
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(false);
          setVal(value ?? "");
        }}
        disabled={pending}
        className="text-[10.5px] px-1.5 py-0.5 rounded text-[color:var(--fg-subtle)] hover:text-[#fca5a5]"
        title="Cancelar (Esc)"
      >
        ✕
      </button>
    </span>
  );
}

export function RoleCell({
  id,
  value,
  canEdit,
}: {
  id: number;
  value: "owner" | "vendedor";
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(value);

  function badge(role: "owner" | "vendedor") {
    return role === "owner" ? (
      <span
        className="inline-block rounded-md px-2 py-0.5 text-[11px]"
        style={{
          backgroundColor: "rgba(70,200,154,0.12)",
          border: "1px solid var(--b-strong)",
          color: "var(--mint-200)",
        }}
      >
        Admin
      </span>
    ) : (
      <span className="text-[color:var(--fg-subtle)] text-[12px]">
        Usuário
      </span>
    );
  }

  if (!canEdit) return badge(value);

  function commit(next: "owner" | "vendedor") {
    if (next === val) return;
    setVal(next);
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      fd.set("field", "role");
      fd.set("value", next);
      try {
        await updateUsuarioFieldAction(fd);
        router.refresh();
      } catch (e) {
        alert(e instanceof Error ? e.message : "Erro ao salvar.");
        setVal(value);
      }
    });
  }

  return (
    <select
      value={val}
      disabled={pending}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => {
        e.stopPropagation();
        commit(e.target.value as "owner" | "vendedor");
      }}
      className="rounded-md py-0.5 px-1.5 text-[11.5px] focus:outline-none"
      style={{
        backgroundColor: val === "owner" ? "rgba(70,200,154,0.12)" : "var(--ink-3)",
        color: val === "owner" ? "var(--mint-200)" : "var(--fg-muted)",
        border:
          val === "owner"
            ? "1px solid var(--b-strong)"
            : "1px solid var(--b-soft)",
      }}
    >
      <option value="owner">Admin</option>
      <option value="vendedor">Usuário</option>
    </select>
  );
}

type DeletePreview = {
  totalLeads: number;
  outros: { id: number; nome: string; ativo: boolean }[];
};

export function DeleteUserButton({
  id,
  nome,
  isSelf,
}: {
  id: number;
  nome: string;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<DeletePreview | null>(null);

  if (isSelf) return null;

  function close() {
    setPreview(null);
  }

  function openPreview(e: React.MouseEvent) {
    e.stopPropagation();
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      try {
        const res = await getDeletePreviewAction(fd);
        if (res.totalLeads === 0) {
          // Sem leads — confirma e remove direto
          if (
            !confirm(
              `Remover o usuário "${nome}"? Essa ação não pode ser desfeita.`,
            )
          ) {
            return;
          }
          await doRemove(undefined);
        } else {
          setPreview(res);
        }
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao preparar remoção.");
      }
    });
  }

  function doRemove(transferToId: number | null | undefined) {
    start(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      if (transferToId !== undefined) {
        fd.set("transferToId", transferToId === null ? "" : String(transferToId));
      }
      try {
        await removeUsuarioAction(fd);
        setPreview(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Erro ao remover.");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={openPreview}
        disabled={pending}
        className="text-[12px] text-[color:var(--fg-subtle)] hover:text-[#fca5a5] disabled:opacity-50"
        title="Remover usuário"
        aria-label="Remover usuário"
      >
        🗑
      </button>
      {preview && (
        <DeletePreviewModal
          nome={nome}
          preview={preview}
          pending={pending}
          onConfirm={(transferToId) => doRemove(transferToId)}
          onCancel={close}
        />
      )}
    </>
  );
}

function DeletePreviewModal({
  nome,
  preview,
  pending,
  onConfirm,
  onCancel,
}: {
  nome: string;
  preview: DeletePreview;
  pending: boolean;
  onConfirm: (transferToId: number | null) => void;
  onCancel: () => void;
}) {
  const [transferTo, setTransferTo] = useState<string>(
    preview.outros[0]?.id ? String(preview.outros[0].id) : "",
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={(e) => {
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="absolute inset-0 backdrop-blur-md"
        style={{ backgroundColor: "rgba(4,18,13,0.66)" }}
      />
      <div
        className="relative w-full max-w-[520px] rounded-xl flex flex-col"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-base)",
          boxShadow: "var(--glow-lg)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className="px-5 py-4"
          style={{ borderBottom: "1px solid var(--b-soft)" }}
        >
          <p className="text-[10.5px] uppercase tracking-wider text-[color:var(--fg-muted)]">
            Remover usuário
          </p>
          <h2 className="serif text-[20px] leading-tight text-[color:var(--fg)] mt-1">
            {nome}
          </h2>
        </header>

        <div className="px-5 py-4 space-y-3">
          <p className="text-[13px] text-[color:var(--fg)]">
            Esse usuário tem{" "}
            <strong className="text-[color:var(--mint-300)]">
              {preview.totalLeads} lead{preview.totalLeads === 1 ? "" : "s"}
            </strong>{" "}
            atribuído{preview.totalLeads === 1 ? "" : "s"}. Para onde devemos
            transferir?
          </p>

          <label className="block">
            <span className="block text-[11.5px] text-[color:var(--fg-muted)] mb-1.5">
              Transferir para
            </span>
            <select
              value={transferTo}
              onChange={(e) => setTransferTo(e.target.value)}
              className="w-full rounded-[10px] py-[10px] px-3 text-[13px]"
              style={{
                backgroundColor: "var(--ink-3)",
                color: "var(--fg)",
                border: "1px solid var(--b-soft)",
              }}
            >
              <option value="">— deixar sem vendedor (IA assume) —</option>
              {preview.outros.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nome}
                  {v.ativo ? "" : " (inativo)"}
                </option>
              ))}
            </select>
          </label>

          <p className="text-[11.5px] text-[color:var(--fg-subtle)] leading-snug">
            Se escolher "deixar sem vendedor", os leads voltam para a fila de
            distribuição da IA. Você pode reatribuir depois pela tela de Leads.
          </p>
        </div>

        <footer
          className="px-5 py-3 flex items-center justify-end gap-2"
          style={{ borderTop: "1px solid var(--b-soft)" }}
        >
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="btn-ghost text-[12.5px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() =>
              onConfirm(transferTo === "" ? null : Number(transferTo))
            }
            disabled={pending}
            className="text-[12.5px] px-3 py-1.5 rounded-md disabled:opacity-50"
            style={{
              backgroundColor: "rgba(248,113,113,0.10)",
              color: "#fca5a5",
              border: "1px solid rgba(248,113,113,0.32)",
            }}
          >
            {pending ? "Removendo..." : "Confirmar e remover"}
          </button>
        </footer>
      </div>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { deleteClienteAction } from "./actions";

type Row = {
  id: number;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  crmTenant: string | null;
  lojasCount: number;
  isSuperadmin: boolean;
};

export function ClientesTable({
  rows,
  viewerCanDelete,
  viewerClienteId,
}: {
  rows: Row[];
  viewerCanDelete: boolean;
  viewerClienteId: number;
}) {
  const router = useRouter();

  if (rows.length === 0) {
    return (
      <p className="text-[color:var(--fg-subtle)] text-[13px]">
        Nenhum cliente disponível.
      </p>
    );
  }

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <table className="table-editorial">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Subdomínio</th>
            <th>E-mail</th>
            <th>Telefone</th>
            <th className="text-right">Lojas</th>
            <th className="text-right">Tipo</th>
            {viewerCanDelete && <th aria-label="Ações" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.id}
              className="cursor-pointer"
              onClick={() => router.push(`?detail=${r.id}`)}
              onKeyDown={(e) => {
                if (e.key === "Enter") router.push(`?detail=${r.id}`);
              }}
              tabIndex={0}
              role="button"
              aria-label={`Editar ${r.nome ?? `cliente ${r.id}`}`}
            >
              <td className="font-medium hover:text-[color:var(--mint-300)]">
                {r.nome ?? `Cliente #${r.id}`}
              </td>
              <td className="numerics text-[color:var(--fg-muted)]">
                {r.crmTenant ?? "—"}
              </td>
              <td className="text-[color:var(--fg-muted)]">{r.email ?? "—"}</td>
              <td className="text-[color:var(--fg-muted)]">
                {r.telefone ?? "—"}
              </td>
              <td className="text-right numerics">{r.lojasCount}</td>
              <td className="text-right">
                {r.isSuperadmin ? (
                  <span
                    className="inline-block rounded-md px-2 py-0.5 text-[11px]"
                    style={{
                      backgroundColor: "rgba(70,200,154,0.12)",
                      border: "1px solid var(--b-strong)",
                      color: "var(--mint-200)",
                    }}
                  >
                    Superadmin
                  </span>
                ) : (
                  <span className="text-[color:var(--fg-subtle)] text-[12px]">
                    Cliente
                  </span>
                )}
              </td>
              {viewerCanDelete && (
                <td
                  className="text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DeleteClienteButton
                    id={r.id}
                    nome={r.nome ?? `Cliente #${r.id}`}
                    tenant={r.crmTenant ?? ""}
                    isSelf={r.id === viewerClienteId}
                    isSuperadmin={r.isSuperadmin}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DeleteClienteButton({
  id,
  nome,
  tenant,
  isSelf,
  isSuperadmin,
}: {
  id: number;
  nome: string;
  tenant: string;
  isSelf: boolean;
  isSuperadmin: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (isSelf || isSuperadmin) return null;

  function remove() {
    const confirmText = prompt(
      `Para remover o cliente "${nome}", digite o subdomínio "${tenant}" abaixo.\n\nIsso vai apagar TODOS os leads, agentes e agendamentos desse tenant. Não tem como desfazer.`,
    );
    if (confirmText !== tenant) {
      if (confirmText !== null)
        alert(`Texto não bate com "${tenant}". Cancelado.`);
      return;
    }
    start(async () => {
      const fd = new FormData();
      fd.set("clienteId", String(id));
      const r = await deleteClienteAction(fd);
      if (!r.ok) {
        alert(r.error);
        return;
      }
      alert(
        `Removido. ${r.leads} leads, ${r.agendamentos} agendamentos, ${r.agentes} agentes apagados.`,
      );
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={pending}
      className="text-[12px] text-[color:var(--fg-subtle)] hover:text-[#fca5a5] disabled:opacity-50"
      title="Remover cliente"
      aria-label="Remover cliente"
    >
      🗑
    </button>
  );
}

import Link from "next/link";
import { readSession } from "@/lib/auth/session";
import { isOwner } from "@/lib/auth/guard";
import { PageHeader } from "@/components/page-header";

export default async function PerfilPage() {
  const session = await readSession();
  if (!session) return null;
  const owner = isOwner(session);

  return (
    <>
      <PageHeader
        title="Perfil"
        subtitle="Sessão atual."
        actions={
          owner ? (
            <Link
              href="/clientes"
              className="btn-ghost"
            >
              Editar dados do cliente
            </Link>
          ) : null
        }
      />
      <div className="px-6 pb-12">
        <dl className="grid gap-3 sm:grid-cols-2 max-w-xl">
          <Item k="Nome" v={session.name ?? "—"} />
          <Item k="E-mail" v={session.email} />
          <Item k="Tipo" v={session.kind === "cliente" ? "Cliente (owner)" : "Vendedor"} />
          <Item k="Tenant" v={session.tenant} />
          <Item k="cliente_id" v={String(session.clienteId)} />
          <Item k="user_id" v={String(session.userId)} />
        </dl>
        {!owner && (
          <p className="text-xs text-[color:var(--fg-subtle)] mt-4">
            Sua conta é de vendedor. Edição de dados do cliente, usuários,
            agentes e agendamentos é restrita ao dono da loja.
          </p>
        )}
      </div>
    </>
  );
}

function Item({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-md border border-[color:var(--b-soft)] bg-[color:var(--ink-3)] p-4">
      <dt className="text-xs uppercase tracking-wider text-[color:var(--fg-subtle)]">{k}</dt>
      <dd className="mt-1 font-mono text-sm">{v}</dd>
    </div>
  );
}

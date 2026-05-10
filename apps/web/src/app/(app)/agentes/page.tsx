import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { agentes, clientes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import { AgentesTable, type AgenteRowFull } from "./agentes-table";

export default async function AgentesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const isSuper = await isSuperadminFresh(session);
  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = session.kind === "cliente";

  const { q } = await searchParams;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const query = norm((q ?? "").trim());

  // Carrega lista de clientes (pra mapping clienteId → nome + tenant).
  const allClientes = isSuper
    ? await db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          crmTenant: clientes.crmTenant,
        })
        .from(clientes)
        .orderBy(asc(clientes.nome))
    : await db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          crmTenant: clientes.crmTenant,
        })
        .from(clientes)
        .where(eq(clientes.id, session.clienteId));

  const clienteMap = new Map(
    allClientes.map((c) => [
      c.id,
      { nome: c.nome, tenant: c.crmTenant },
    ]),
  );

  // Carrega agentes — super vê todos, cliente vê os próprios.
  const rowsRaw = isSuper
    ? await db.select().from(agentes).orderBy(asc(agentes.name))
    : await db
        .select()
        .from(agentes)
        .where(eq(agentes.clienteId, session.clienteId));

  const allRows: AgenteRowFull[] = rowsRaw.map((a) => {
    const c = clienteMap.get(a.clienteId);
    return {
      ...a,
      clienteNome: c?.nome ?? null,
      clienteTenant: c?.tenant ?? null,
    };
  });

  const filtered = query
    ? allRows.filter((r) => {
        const hay = [
          r.name,
          r.description,
          r.prompt,
          r.idN8n,
          r.clienteNome,
          r.clienteTenant,
        ]
          .map((v) => norm(String(v ?? "")))
          .join(" ");
        return hay.includes(query);
      })
    : allRows;

  return (
    <div className="px-7 pt-6 pb-12">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
          Agentes
        </h1>
        <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
          {filtered.length} {filtered.length === 1 ? "agente" : "agentes"}
          {q ? ` · "${q}"` : ""}
        </span>
      </div>

      <section
        className="rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <AgentesTable
          rows={filtered}
          isSuper={isSuper}
          canEdit={canEdit}
          clientes={allClientes.map((c) => ({
            id: c.id,
            nome: c.nome ?? `Cliente #${c.id}`,
          }))}
        />
      </section>
    </div>
  );
}

import { eq, asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import {
  automacoes,
  clientes,
  isPlaceholderLoja,
  isPlaceholderVendedor,
  type Loja,
  type Vendedor,
} from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import {
  AutomacoesTable,
  type AutomacaoRowFull,
  type LojaOption,
} from "./automacoes-table";

export default async function AutomacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const isSuper = await isSuperadminFresh(session);
  // Super sempre edita; cliente kind=cliente edita; vendedor read-only.
  const canEdit = session.kind === "cliente";
  const isVendedor = session.kind === "usuario";

  const { q } = await searchParams;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const query = norm((q ?? "").trim());

  // Carrega lista de clientes visíveis ao caller (com lojas pra resolver
  // lojaNome em memória + vendedores pra gating de vendedor).
  const allClientes = isSuper
    ? await db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          crmTenant: clientes.crmTenant,
          lojas: clientes.lojas,
          vendedores: clientes.vendedores,
        })
        .from(clientes)
        .orderBy(asc(clientes.nome))
    : await db
        .select({
          id: clientes.id,
          nome: clientes.nome,
          crmTenant: clientes.crmTenant,
          lojas: clientes.lojas,
          vendedores: clientes.vendedores,
        })
        .from(clientes)
        .where(eq(clientes.id, session.clienteId));

  // Mapa cliente → metadados.
  const clienteMap = new Map(
    allClientes.map((c) => [
      c.id,
      {
        nome: c.nome,
        tenant: c.crmTenant,
        lojas: (Array.isArray(c.lojas) ? (c.lojas as Loja[]) : []).filter(
          (l) => !isPlaceholderLoja(l),
        ),
        vendedores: (Array.isArray(c.vendedores)
          ? (c.vendedores as Vendedor[])
          : []
        ).filter((v) => !isPlaceholderVendedor(v)),
      },
    ]),
  );

  // Lojas permitidas pro caller (vendedor: só onde está vinculado).
  const lojasOptions: LojaOption[] = [];
  const allowedLojaIdsByCliente = new Map<number, Set<string> | null>();
  for (const [cid, info] of clienteMap.entries()) {
    let allowed: Set<string> | null = null;
    if (isVendedor) {
      const me = info.vendedores.find((v) => v.id === session.userId);
      allowed = new Set(me?.loja_ids ?? []);
    }
    allowedLojaIdsByCliente.set(cid, allowed);
    for (const l of info.lojas) {
      if (allowed && !allowed.has(l.id)) continue;
      lojasOptions.push({ id: l.id, nome: l.nome, clienteId: cid });
    }
  }

  // Carrega automações — super vê todas, cliente comum só do próprio.
  const rowsRaw = isSuper
    ? await db.select().from(automacoes).orderBy(asc(automacoes.nome))
    : await db
        .select()
        .from(automacoes)
        .where(eq(automacoes.clienteId, session.clienteId));

  const allRows: AutomacaoRowFull[] = rowsRaw.flatMap((a) => {
    const c = clienteMap.get(a.clienteId);
    if (!c) return [];
    // Vendedor: só lojas vinculadas.
    if (isVendedor) {
      const allowed = allowedLojaIdsByCliente.get(a.clienteId);
      if (allowed && !allowed.has(a.lojaId)) return [];
    }
    const loja = c.lojas.find((l) => l.id === a.lojaId);
    return [
      {
        ...a,
        clienteNome: c.nome,
        clienteTenant: c.tenant,
        lojaNome: loja?.nome ?? null,
      },
    ];
  });

  const filtered = query
    ? allRows.filter((r) => {
        const hay = [
          r.nome,
          r.descricao,
          r.baseUrl,
          r.n8nWorkflowId,
          r.versao,
          r.lojaNome,
          r.clienteNome,
          r.clienteTenant,
        ]
          .map((v) => norm(String(v ?? "")))
          .join(" ");
        return hay.includes(query);
      })
    : allRows;

  const clientesPicker = allClientes.map((c) => ({
    id: c.id,
    nome: c.nome ?? `Cliente #${c.id}`,
  }));

  return (
    <div className="px-7 pt-6 pb-12">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
          Automações
        </h1>
        <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
          {filtered.length}{" "}
          {filtered.length === 1 ? "automação" : "automações"}
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
        <AutomacoesTable
          rows={filtered}
          isSuper={isSuper}
          canEdit={canEdit}
          clientes={clientesPicker}
          lojas={lojasOptions}
        />
      </section>
    </div>
  );
}

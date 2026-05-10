import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { clientes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import { ClientesTable, type ClienteRow } from "./clientes-table";
import { ClientesHelpTip } from "./help-tip";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const isSuper = await isSuperadminFresh(session);
  const { q } = await searchParams;

  const cols = {
    id: clientes.id,
    createdAt: clientes.createdAt,
    nome: clientes.nome,
    email: clientes.email,
    telefone: clientes.telefone,
    senha: clientes.senha,
    isActive: clientes.isActive,
    apiToken: clientes.apiToken,
    apiInstanciaNome: clientes.apiInstanciaNome,
    apiBaseUrl: clientes.apiBaseUrl,
    crmTenant: clientes.crmTenant,
    crmToken: clientes.crmToken,
    crmOrigemId: clientes.crmOrigemId,
    crmStatusColunas: clientes.crmStatusColunas,
    isSuperadmin: clientes.isSuperadmin,
  };

  const rowsRaw = isSuper
    ? await db.select(cols).from(clientes).orderBy(asc(clientes.nome))
    : await db.select(cols).from(clientes).where(eq(clientes.id, session.clienteId));

  // Normaliza pra busca case + accent-insensitive: lowercase + remove
  // diacríticos (ex: "São" → "sao", "Lóóper" → "looper").
  const norm = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "");
  const query = norm((q ?? "").trim());
  const filtered: ClienteRow[] = (
    query
      ? rowsRaw.filter((c) =>
          [
            c.nome,
            c.email,
            c.telefone,
            c.crmTenant,
            c.apiInstanciaNome,
            c.apiBaseUrl,
            c.crmOrigemId,
          ]
            .map((v) => norm(String(v ?? "")))
            .some((s) => s.includes(query)),
        )
      : rowsRaw
  ).map((c) => ({
    id: c.id,
    createdAt: c.createdAt ?? null,
    nome: c.nome,
    email: c.email,
    telefone: c.telefone,
    senha: c.senha,
    isActive: c.isActive ?? null,
    apiToken: c.apiToken,
    apiInstanciaNome: c.apiInstanciaNome,
    apiBaseUrl: c.apiBaseUrl,
    crmTenant: c.crmTenant,
    crmToken: c.crmToken,
    crmOrigemId: c.crmOrigemId,
    crmStatusColunas: c.crmStatusColunas ?? null,
    isSuperadmin: c.isSuperadmin ?? null,
  }));

  const contexto = isSuper
    ? "Todos os tenants — colunas simples da tabela clientes (lojas, vendedores e funis ficam no Cadastro)."
    : "Dados de cadastro do seu tenant.";

  return (
    <div className="px-7 pt-6 pb-12">
      {/* Header — só título + tooltip + contagem. Search e ações
          ficam dentro do toolbar da tabela. */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
          Clientes
        </h1>
        <ClientesHelpTip contexto={contexto} />
        <span className="text-[11.5px] text-[color:var(--fg-subtle)]">
          {filtered.length}{" "}
          {filtered.length === 1 ? "cliente" : "clientes"}
          {query ? ` · "${query}"` : ""}
        </span>
      </div>

      {/* Tabela em surface dedicada — separa visualmente da barra de
          comandos acima. Fundo ink-2 + radius + border sutil. */}
      <section
        className="rounded-xl"
        style={{
          backgroundColor: "var(--ink-2)",
          border: "1px solid var(--b-soft)",
        }}
      >
        <ClientesTable rows={filtered} isSuper={isSuper} />
      </section>
    </div>
  );
}

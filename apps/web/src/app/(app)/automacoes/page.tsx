import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { automacoes } from "@/lib/db/schema";
import { readSession } from "@/lib/auth/session";
import { isSuperadminFresh } from "@/lib/auth/guard";
import { AutomacoesTable } from "./automacoes-table";

export default async function AutomacoesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await readSession();
  if (!session) return null;
  const isSuper = await isSuperadminFresh(session);

  // Catálogo é super-only. Cliente comum / vendedor cai em empty state
  // explicando o caminho correto (drilldown do cliente).
  if (!isSuper) {
    return (
      <div className="px-7 pt-6 pb-12">
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)] mb-3">
          Automações
        </h1>
        <div
          className="rounded-xl px-5 py-6"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-soft)",
          }}
        >
          <p className="text-[13.5px] text-[color:var(--fg)] mb-2">
            O catálogo de automações é gerenciado apenas pelo superadmin
            Groner.
          </p>
          <p className="text-[12.5px] text-[color:var(--fg-muted)]">
            Pra ver e configurar as automações vinculadas ao seu cliente,
            acesse:{" "}
            <Link
              href={`/clientes/${session.clienteId}/automacoes`}
              className="text-[color:var(--mint-300)] hover:text-[color:var(--mint-200)]"
            >
              meu cliente · automações
            </Link>
            .
          </p>
        </div>
      </div>
    );
  }

  const { q } = await searchParams;
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
  const query = norm((q ?? "").trim());

  const rowsRaw = await db
    .select()
    .from(automacoes)
    .orderBy(asc(automacoes.nome));

  const filtered = query
    ? rowsRaw.filter((r) => {
        const hay = [
          r.nome,
          r.descricao,
          r.baseUrl,
          r.n8nWorkflowId,
          r.versao,
        ]
          .map((v) => norm(String(v ?? "")))
          .join(" ");
        return hay.includes(query);
      })
    : rowsRaw;

  return (
    <div className="px-7 pt-6 pb-12">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <h1 className="serif text-[28px] sm:text-[32px] leading-none font-normal text-[color:var(--fg)]">
          Automações · catálogo
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
        <AutomacoesTable rows={filtered} canEdit={isSuper} />
      </section>
    </div>
  );
}

import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { PageHeader } from "@/components/page-header";

type VendedorInconsistente = {
  cliente_id: number;
  cliente_nome: string | null;
  cliente_tenant: string | null;
  uid: string;
  nome: string | null;
  email: string | null;
};

export default async function HealthPage() {
  const rows = await db.execute<VendedorInconsistente>(sql`
    SELECT
      c.id AS cliente_id,
      c.nome AS cliente_nome,
      c.crm_tenant AS cliente_tenant,
      v->>'uid' AS uid,
      v->>'nome' AS nome,
      v->>'email' AS email
    FROM clientes c, jsonb_array_elements(c.vendedores) v
    WHERE (v->>'recebe_agendamento')::boolean = true
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_each(COALESCE(v->'horarios', '{}'::jsonb)) e
        WHERE jsonb_typeof(e.value) = 'array'
          AND jsonb_array_length(e.value) > 0
      )
    ORDER BY c.nome NULLS LAST, v->>'nome'
  `);

  const lista = rows as unknown as VendedorInconsistente[];

  return (
    <>
      <PageHeader
        eyebrow="Saúde do sistema"
        title="Vendedores inconsistentes"
        subtitle="Vendedores marcados como 'Recebe agendamentos' mas sem horário cadastrado em nenhum dia."
      />

      <div className="px-7 pb-12 space-y-6">
        <Link
          href="/flows"
          className="text-[12px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)]"
        >
          ← Voltar pra Flows
        </Link>

        {lista.length === 0 ? (
          <div
            className="rounded-xl p-6 text-[13px]"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
              color: "var(--mint-300)",
            }}
          >
            ✓ Nenhuma inconsistência detectada. Todos vendedores marcados como
            &quot;Recebe agendamentos&quot; têm pelo menos 1 horário cadastrado.
          </div>
        ) : (
          <>
            <div
              className="rounded-xl p-4 text-[12.5px]"
              style={{
                backgroundColor: "var(--amber-bg)",
                color: "var(--amber-300)",
                border: "1px solid var(--amber-border)",
              }}
            >
              <strong>{lista.length}</strong> vendedor
              {lista.length === 1 ? "" : "es"} com flag &quot;Recebe
              agendamentos&quot; mas sem janela de atendimento. Sistema pode
              mandar leads pra eles e ninguém atender. Solução: desmarcar a
              flag OU cadastrar horários.
            </div>

            <div className="overflow-x-auto">
              <table className="table-editorial">
                <thead>
                  <tr>
                    <th className="text-left">Cliente</th>
                    <th className="text-left">Vendedor</th>
                    <th className="text-left">E-mail</th>
                    <th className="text-right">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map((row) => (
                    <tr key={`${row.cliente_id}-${row.uid}`}>
                      <td>
                        <div className="text-[13px] text-[color:var(--fg)]">
                          {row.cliente_nome ?? "(sem nome)"}
                        </div>
                        <div className="text-[10.5px] text-[color:var(--fg-subtle)]">
                          #{row.cliente_id}
                          {row.cliente_tenant ? ` · ${row.cliente_tenant}` : ""}
                        </div>
                      </td>
                      <td>
                        <div className="text-[13px] text-[color:var(--fg)]">
                          {row.nome ?? "(sem nome)"}
                        </div>
                        <div className="text-[10.5px] text-[color:var(--fg-subtle)] numerics">
                          {row.uid.slice(0, 8)}…
                        </div>
                      </td>
                      <td className="text-[12.5px] text-[color:var(--fg-muted)]">
                        {row.email ?? "—"}
                      </td>
                      <td className="text-right">
                        <Link
                          href={`/clientes/${row.cliente_id}/vendedores/${row.uid}/horarios`}
                          className="chip chip-mint text-[10.5px] px-2 py-1"
                        >
                          Configurar horários →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}

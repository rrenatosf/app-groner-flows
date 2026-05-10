/**
 * Backfill: garante que todo vendedor em clientes.vendedores tenha:
 *   - uid (uuid estável)
 *   - loja_ids (array — default vazio)
 *
 * Idempotente. Preserva uid/loja_ids existentes; só preenche o que falta.
 *
 * Uso:
 *   cd apps/web
 *   npm run backfill:vendedor-ids           # dry-run
 *   npm run backfill:vendedor-ids:apply     # aplica
 */

import { randomUUID } from "node:crypto";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL não configurada — abortando.");
  process.exit(1);
}

const APPLY = process.argv.includes("--apply");
const sql = postgres(url, { prepare: false });

type VendedorJson = Record<string, unknown>;

async function main() {
  console.log(
    APPLY
      ? "→ APPLY: alterações vão ser gravadas no banco."
      : "→ DRY-RUN: nenhuma alteração será gravada. Use --apply pra confirmar.",
  );

  const rows: { id: number; nome: string | null; vendedores: VendedorJson[] }[] =
    await sql`SELECT id, nome, vendedores FROM clientes ORDER BY id`;

  let totalClientes = 0;
  let totalVendedores = 0;
  let uidAdicionados = 0;
  let lojaIdsAdicionados = 0;
  let clientesAfetados = 0;

  for (const c of rows) {
    totalClientes++;
    const vendedores = Array.isArray(c.vendedores) ? c.vendedores : [];
    let touched = false;
    const next = vendedores.map((v) => {
      totalVendedores++;
      if (!v || typeof v !== "object") return v;
      const obj = v as VendedorJson;
      const patch: VendedorJson = { ...obj };

      const curUid = obj.uid;
      if (typeof curUid !== "string" || curUid.trim().length === 0) {
        patch.uid = randomUUID();
        uidAdicionados++;
        touched = true;
      }

      const curLojaIds = obj.loja_ids;
      if (!Array.isArray(curLojaIds)) {
        patch.loja_ids = [];
        lojaIdsAdicionados++;
        touched = true;
      }

      return patch;
    });

    if (touched) {
      clientesAfetados++;
      console.log(
        `  cliente #${c.id} (${c.nome ?? "—"}): ` +
          `${next.filter((n, i) => n !== vendedores[i]).length} vendedor(es) ajustado(s)`,
      );
      if (APPLY) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sql`UPDATE clientes SET vendedores = ${sql.json(next as any)} WHERE id = ${c.id}`;
      }
    }
  }

  console.log("");
  console.log("== Resumo ==");
  console.log(`  Clientes lidos:           ${totalClientes}`);
  console.log(`  Vendedores inspecionados: ${totalVendedores}`);
  console.log(`  Vendedores sem uid:       ${uidAdicionados}`);
  console.log(`  Vendedores sem loja_ids:  ${lojaIdsAdicionados}`);
  console.log(`  Clientes afetados:        ${clientesAfetados}`);
  if (!APPLY && (uidAdicionados > 0 || lojaIdsAdicionados > 0)) {
    console.log("");
    console.log("Rode novamente com --apply pra gravar.");
  }
  if (APPLY && (uidAdicionados > 0 || lojaIdsAdicionados > 0)) {
    console.log("");
    console.log("✓ Backfill aplicado. Re-execute sem --apply pra confirmar idempotência.");
  }
  if (uidAdicionados === 0 && lojaIdsAdicionados === 0) {
    console.log("");
    console.log("✓ Nada a fazer — todos os vendedores já têm uid + loja_ids.");
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .catch((e) => {
    console.error("Erro no backfill:", e);
    return sql.end({ timeout: 5 }).then(() => process.exit(1));
  });

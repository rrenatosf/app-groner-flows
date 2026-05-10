/**
 * Backfill: garante que toda loja em clientes.lojas tenha um campo `id`
 * (uuid). Idempotente — preserva ids existentes; gera só onde faltar.
 *
 * Uso:
 *   cd apps/web
 *   npm run backfill:loja-ids           # dry-run (não grava)
 *   npm run backfill:loja-ids:apply     # aplica no banco
 *
 * Conecta via DATABASE_URL do .env.local. O npm script carrega via
 * `node --env-file=.env.local`. Não usa server-only (CLI, fora do Next).
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

type LojaJson = Record<string, unknown>;

async function main() {
  console.log(
    APPLY
      ? "→ APPLY: alterações vão ser gravadas no banco."
      : "→ DRY-RUN: nenhuma alteração será gravada. Use --apply pra confirmar.",
  );

  const rows: { id: number; nome: string | null; lojas: LojaJson[] }[] =
    await sql`SELECT id, nome, lojas FROM clientes ORDER BY id`;

  let totalClientes = 0;
  let totalLojas = 0;
  let totalAdicionados = 0;
  let clientesAfetados = 0;

  for (const c of rows) {
    totalClientes++;
    const lojas = Array.isArray(c.lojas) ? c.lojas : [];
    let touched = false;
    const next = lojas.map((loja) => {
      totalLojas++;
      if (loja && typeof loja === "object") {
        const obj = loja as LojaJson;
        const cur = obj.id;
        if (typeof cur === "string" && cur.trim().length > 0) {
          return obj;
        }
        touched = true;
        totalAdicionados++;
        return { id: randomUUID(), ...obj };
      }
      return loja;
    });

    if (touched) {
      clientesAfetados++;
      console.log(
        `  cliente #${c.id} (${c.nome ?? "—"}): +${
          next.filter((l, i) => l !== lojas[i]).length
        } loja(s) ganharam id`,
      );
      if (APPLY) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await sql`UPDATE clientes SET lojas = ${sql.json(next as any)} WHERE id = ${c.id}`;
      }
    }
  }

  console.log("");
  console.log("== Resumo ==");
  console.log(`  Clientes lidos:       ${totalClientes}`);
  console.log(`  Lojas inspecionadas:  ${totalLojas}`);
  console.log(`  Lojas sem id:         ${totalAdicionados}`);
  console.log(`  Clientes afetados:    ${clientesAfetados}`);
  if (!APPLY && totalAdicionados > 0) {
    console.log("");
    console.log("Rode novamente com --apply pra gravar.");
  }
  if (APPLY && totalAdicionados > 0) {
    console.log("");
    console.log("✓ Backfill aplicado. Re-execute sem --apply pra confirmar idempotência.");
  }
  if (totalAdicionados === 0) {
    console.log("");
    console.log("✓ Nada a fazer — todas as lojas já têm id.");
  }
}

main()
  .then(() => sql.end({ timeout: 5 }))
  .catch((e) => {
    console.error("Erro no backfill:", e);
    return sql.end({ timeout: 5 }).then(() => process.exit(1));
  });

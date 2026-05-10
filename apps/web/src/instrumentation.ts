export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { sql } = await import("@/lib/db/client");
    try {
      await sql`SELECT 1`;
    } catch (e) {
      console.warn("[instrumentation] db warmup falhou:", e);
    }
  }
}

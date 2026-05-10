import "server-only";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  pg?: ReturnType<typeof postgres>;
};

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL não configurado");
}

export const sql = globalForDb.pg ?? postgres(url, { prepare: false });
if (process.env.NODE_ENV !== "production") globalForDb.pg = sql;

export const db = drizzle(sql, { schema });

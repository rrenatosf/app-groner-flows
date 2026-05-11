/**
 * Rate limiter sliding-window in-memory pra Next.js middleware.
 *
 * Implementação propositalmente simples (Map + array de timestamps) —
 * funciona em single-instance (dev, VPS único, edge node). NÃO é
 * distribuído: cada worker tem seu próprio contador. Pra produção
 * multi-instance trocar pelo `@upstash/ratelimit` (mesma assinatura).
 *
 * Sliding window: pra cada chave, mantém array de timestamps das últimas
 * requests. Conta quantas estão dentro do window. Se >= limite → bloqueia
 * e retorna `reset` (quando a 1ª da janela expira).
 *
 * Limpeza: a cada `limit()` o array filtra timestamps fora da janela.
 * Sem GC global — chaves inativas eventualmente saem da memória via
 * `cleanupTick` (rodado opcionalmente).
 */

const WINDOW_MS_8MIN = 8 * 60 * 1000;

type Zone = {
  /** Identificador pra logs. */
  name: string;
  /** Quantas requests por janela. */
  limit: number;
  /** Tamanho da janela em ms. */
  windowMs: number;
};

export const ZONES = {
  // Auth mantido apertado contra bruteforce (~3/min em média).
  auth: {
    name: "auth",
    limit: 24,
    windowMs: WINDOW_MS_8MIN,
  },
  // API: 480 req / 8 min = 60 req/min sustentado. Burst único pode usar
  // a janela inteira de uma vez.
  api: {
    name: "api",
    limit: 480,
    windowMs: WINDOW_MS_8MIN,
  },
  // Page: não usado no matcher atual, mantém placeholder caso ative.
  page: {
    name: "page",
    limit: 1600,
    windowMs: WINDOW_MS_8MIN,
  },
} satisfies Record<string, Zone>;

export type ZoneName = keyof typeof ZONES;

// Store em memória — Map<`${zone}:${id}`, timestamps[]>
const store = new Map<string, number[]>();

// Cleanup periódico básico: a cada N hits, dropa chaves vazias.
let hits = 0;
const CLEANUP_EVERY = 500;

function maybeCleanup(now: number) {
  hits++;
  if (hits < CLEANUP_EVERY) return;
  hits = 0;
  for (const [k, arr] of store) {
    if (arr.length === 0) {
      store.delete(k);
      continue;
    }
    const lastTs = arr[arr.length - 1];
    // Se nenhuma request nos últimos 30 min, dropa chave.
    if (now - lastTs > 30 * 60 * 1000) {
      store.delete(k);
    }
  }
}

export type LimitResult = {
  success: boolean;
  /** Quantas requests sobraram na janela atual. */
  remaining: number;
  /** Timestamp (ms epoch) de quando o slot mais antigo libera. */
  reset: number;
  /** Limite total da zona. */
  limit: number;
};

/** Aplica rate limit pra `id` na `zone`. Retorna se passou + métricas. */
export function limit(
  zone: ZoneName,
  id: string,
): LimitResult {
  const z = ZONES[zone];
  const now = Date.now();
  const cutoff = now - z.windowMs;
  const key = `${zone}:${id}`;
  const arr = store.get(key) ?? [];
  // Drop timestamps fora da janela.
  const filtered = arr.filter((t) => t > cutoff);
  if (filtered.length >= z.limit) {
    // Bloqueio. Reset = quando a 1ª da janela vai expirar.
    const oldest = filtered[0];
    store.set(key, filtered);
    maybeCleanup(now);
    return {
      success: false,
      remaining: 0,
      reset: oldest + z.windowMs,
      limit: z.limit,
    };
  }
  filtered.push(now);
  store.set(key, filtered);
  maybeCleanup(now);
  return {
    success: true,
    remaining: z.limit - filtered.length,
    reset: now + z.windowMs,
    limit: z.limit,
  };
}

/** Identifica o cliente. Prioriza `x-forwarded-for` (CDN/proxy), depois
 *  `x-real-ip`, fallback "unknown". Em dev local, IP costuma ser `::1`. */
export function getClientId(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const ip = fwd.split(",")[0]?.trim();
    if (ip) return ip;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/** Decide a zone pelo path. Ordem importa: match mais específico
 *  primeiro. Retorna null pra paths que não devem ser rate-limited
 *  (assets, webhooks externos, healthcheck). */
export function pickZone(pathname: string): ZoneName | null {
  // Assets / sistema
  if (pathname.startsWith("/_next/")) return null;
  if (pathname === "/favicon.ico") return null;
  if (pathname.startsWith("/assets/")) return null;
  // Webhooks externos: confiar em HMAC/secret próprio, não rate-limit
  // por IP (CRM/N8N podem disparar bursts legítimos).
  if (pathname.startsWith("/api/webhooks/")) return null;
  // Auth: bruteforce protection
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) {
    return "auth";
  }
  // API geral
  if (pathname.startsWith("/api/")) return "api";
  // Páginas autenticadas (escopo do app)
  return "page";
}

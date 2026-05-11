import { NextRequest, NextResponse } from "next/server";
import { getClientId, limit, pickZone } from "@/lib/rate-limit";

/** Bypass total via env (CI, debug). */
const BYPASS = process.env.RATE_LIMIT_BYPASS === "1";

export function middleware(req: NextRequest) {
  if (BYPASS) return NextResponse.next();

  const pathname = req.nextUrl.pathname;
  const zone = pickZone(pathname);
  if (!zone) return NextResponse.next();

  const id = getClientId(req);
  const r = limit(zone, id);

  if (!r.success) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((r.reset - Date.now()) / 1000),
    );
    // Pra requests fetch-style (XHR/JSON), responde JSON. Pra navegação
    // de página, retorna 429 simples com mensagem clara.
    const isApi = pathname.startsWith("/api/");
    if (isApi) {
      return NextResponse.json(
        {
          error: "Muitas requisições. Aguarde alguns minutos.",
          retryAfter: retryAfterSec,
          zone,
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(retryAfterSec),
            "X-RateLimit-Limit": String(r.limit),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(r.reset),
          },
        },
      );
    }
    return new NextResponse(
      `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>429 — Muitas requisições</title><style>body{background:#0a0e0c;color:#a8b4ad;font-family:ui-sans-serif,system-ui;margin:0;padding:80px 32px;text-align:center}h1{color:#6ee7b7;font-weight:500;letter-spacing:-0.02em}p{max-width:520px;margin:16px auto}</style></head><body><h1>Devagar aí 👀</h1><p>Você fez muitas requisições em pouco tempo. Aguarde <strong>${retryAfterSec}s</strong> e tente de novo.</p></body></html>`,
      {
        status: 429,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Retry-After": String(retryAfterSec),
          "X-RateLimit-Limit": String(r.limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(r.reset),
        },
      },
    );
  }

  const res = NextResponse.next();
  res.headers.set("X-RateLimit-Limit", String(r.limit));
  res.headers.set("X-RateLimit-Remaining", String(r.remaining));
  res.headers.set("X-RateLimit-Reset", String(r.reset));
  return res;
}

export const config = {
  // Escopo enxuto: só /login (bruteforce) e /api/* (abuso de endpoints).
  // Páginas autenticadas NÃO entram aqui — Next.js dispara várias
  // requests (RSC, prefetch, HMR em dev) que poluiriam o contador e
  // ainda podiam corromper renderização. Páginas estáticas dependem
  // de CDN/Vercel pra absorver carga.
  matcher: ["/login", "/api/:path*"],
};

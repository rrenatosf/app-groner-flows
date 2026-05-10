import { NextRequest, NextResponse } from "next/server";
import { destroySession } from "@/lib/auth/session";

// Route handler dedicado pra limpar a sessão fora de Server Component.
// Next 16 só permite mutar cookies em Server Action ou Route Handler.
// Usado quando getDashboardData detecta cliente removido e precisa
// derrubar a sessão antes de redirecionar pro login.
export async function GET(req: NextRequest) {
  const reason = req.nextUrl.searchParams.get("reason") ?? "";
  await destroySession();
  const dest = reason
    ? `/login?reason=${encodeURIComponent(reason)}`
    : "/login";
  return NextResponse.redirect(new URL(dest, req.url));
}

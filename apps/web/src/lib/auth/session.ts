import "server-only";
import { cache } from "react";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

const COOKIE_NAME = "novosdr_session";
const SESSION_TTL_DAYS = 7;

function secret() {
  const raw = process.env.SESSION_SECRET;
  if (!raw || raw.length < 32) {
    throw new Error("SESSION_SECRET ausente ou curto demais (>=32 chars).");
  }
  return new TextEncoder().encode(raw);
}

export type SessionPayload = {
  kind: "cliente" | "usuario";
  userId: number;
  clienteId: number;
  tenant: string;
  email: string;
  name: string | null;
};

export async function createSession(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secret());

  const jar = await cookies();
  jar.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export const readSession = cache(
  async (): Promise<SessionPayload | null> => {
    const jar = await cookies();
    const token = jar.get(COOKIE_NAME)?.value;
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, secret());
      return payload as unknown as SessionPayload;
    } catch {
      return null;
    }
  },
);

export async function destroySession() {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

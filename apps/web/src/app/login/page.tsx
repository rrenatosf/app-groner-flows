import Image from "next/image";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Entrar — Groner Flows",
};

export default function LoginPage() {
  return (
    <main
      className="relative min-h-screen flex items-center justify-center px-6 py-12 overflow-hidden"
      style={{ backgroundColor: "var(--ink-1)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(60% 50% at 50% 0%, rgba(70,200,154,0.04), transparent 60%), radial-gradient(45% 45% at 50% 100%, rgba(255,255,255,0.02), transparent 55%)",
        }}
      />

      <div className="relative w-full max-w-[420px] scale-in">
        <div className="flex flex-col items-center mb-10">
          <Image
            src="/assets/brand/groner-logo.png"
            alt="Groner Flows"
            width={56}
            height={56}
            className="rounded-[14px] mb-5 ring-1 ring-[color:var(--b-base)]"
            priority
          />
          <h1 className="text-[40px] leading-[1.05] tracking-tight text-[color:var(--fg)]">
            <span className="font-semibold">Groner</span>{" "}
            <span className="serif italic text-[color:var(--mint-300)]">
              Flows
            </span>
          </h1>
          <p className="text-[13px] text-[color:var(--fg-muted)] mt-3">
            Painel de gestão dos seus agentes IA
          </p>
        </div>

        <div
          className="rounded-2xl backdrop-blur p-7"
          style={{
            backgroundColor: "var(--ink-2)",
            border: "1px solid var(--b-base)",
            boxShadow: "var(--glow-md)",
          }}
        >
          <LoginForm />
        </div>

        <div className="mt-6 text-center text-[11px] text-[color:var(--fg-disabled)] tracking-wide uppercase">
          gronercrm.com.br
        </div>
      </div>
    </main>
  );
}

"use client";

import { useActionState } from "react";
import { loginAction, type LoginActionState } from "./actions";

const initial: LoginActionState = {};

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, initial);

  return (
    <form action={action} className="space-y-4">
      <div>
        <label
          htmlFor="subdomain"
          className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5"
        >
          Subdomínio
        </label>
        <div className="flex items-stretch input p-0 overflow-hidden">
          <input
            id="subdomain"
            name="subdomain"
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            disabled={pending}
            defaultValue={state.values?.subdomain}
            placeholder="looper"
            className="flex-1 bg-transparent px-3 py-[9px] text-[color:var(--fg)] placeholder:text-[color:var(--fg-disabled)] focus:outline-none disabled:opacity-50 text-[14px]"
          />
          <span className="self-center pr-3 text-[12px] text-[color:var(--fg-subtle)] select-none numerics">
            .api.groner.app
          </span>
        </div>
      </div>

      <div>
        <label
          htmlFor="email"
          className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5"
        >
          E-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          disabled={pending}
          defaultValue={state.values?.email}
          placeholder="voce@empresa.com"
          className="input"
        />
      </div>

      <div>
        <label
          htmlFor="password"
          className="block text-[12.5px] font-medium text-[color:var(--fg-muted)] mb-1.5"
        >
          Senha
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={pending}
          className="input"
        />
      </div>

      {state.error && (
        <p
          role="alert"
          className="text-[12.5px] text-[color:var(--rose-300)] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "var(--rose-bg)",
            border: "1px solid var(--rose-border)",
          }}
        >
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className="btn-primary w-full mt-2">
        {pending ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}

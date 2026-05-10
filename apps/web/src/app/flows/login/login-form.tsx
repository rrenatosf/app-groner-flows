"use client";

import { useActionState } from "react";
import { flowsLoginAction, type FlowsLoginState } from "./actions";

const initial: FlowsLoginState = {};

export function FlowsLoginForm() {
  const [state, action, pending] = useActionState(flowsLoginAction, initial);

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
            defaultValue={state.values?.subdomain ?? "looper"}
            className="flex-1 bg-transparent px-3 py-2.5 text-[13px] text-[color:var(--fg)] focus:outline-none"
            placeholder="looper"
          />
          <span
            className="px-3 py-2.5 text-[12px] numerics text-[color:var(--fg-subtle)]"
            style={{ borderLeft: "1px solid var(--b-soft)" }}
          >
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
          required
          disabled={pending}
          defaultValue={state.values?.email}
          className="input w-full"
          placeholder="seu@gronercrm.com.br"
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
          required
          disabled={pending}
          className="input w-full"
        />
      </div>

      {state.error && (
        <p
          className="text-[12.5px] rounded-md px-3 py-2.5"
          style={{
            backgroundColor: "var(--rose-bg)",
            border: "1px solid var(--rose-border)",
            color: "var(--rose-300)",
          }}
        >
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Entrando..." : "Entrar no Flows"}
      </button>
    </form>
  );
}

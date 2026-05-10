"use client";

import { useFormStatus } from "react-dom";
import { useState, useTransition } from "react";

type Action = (formData: FormData) => Promise<void>;

export function Switch({
  id,
  checked,
  action,
  label,
  disabled,
}: {
  id: number;
  checked: boolean;
  action: Action;
  label: string;
  disabled?: boolean;
}) {
  const [optimistic, setOptimistic] = useState(checked);
  const [pending, start] = useTransition();

  function submit(e: React.MouseEvent) {
    e.stopPropagation();
    if (disabled || pending) return;
    const next = !optimistic;
    setOptimistic(next);
    const fd = new FormData();
    fd.set("id", String(id));
    fd.set("next", next ? "1" : "0");
    start(async () => {
      try {
        await action(fd);
      } catch {
        setOptimistic(!next);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={optimistic}
      aria-label={label}
      title={label}
      disabled={disabled || pending}
      onClick={submit}
      className="relative inline-flex h-[20px] w-[36px] items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        backgroundColor: optimistic
          ? "var(--mint-500)"
          : "var(--ink-4)",
        boxShadow: optimistic
          ? "0 0 0 1px var(--b-strong), 0 0 12px -4px rgba(70,200,154,0.5)"
          : "inset 0 0 0 1px var(--b-soft)",
      }}
    >
      <span
        className="inline-block size-[14px] rounded-full bg-white transition-transform"
        style={{
          transform: optimistic ? "translateX(19px)" : "translateX(3px)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.4)",
        }}
      />
    </button>
  );
}

export function SwitchPending() {
  const { pending } = useFormStatus();
  return pending ? <span className="text-xs text-[color:var(--fg-subtle)]">…</span> : null;
}

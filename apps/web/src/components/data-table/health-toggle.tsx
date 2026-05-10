"use client";

export function HealthToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      title={
        value
          ? "Saúde: visível (clique pra ocultar)"
          : "Saúde: oculta (clique pra mostrar)"
      }
      className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md transition-colors"
      style={{
        backgroundColor: "var(--ink-3)",
        border: `1px solid ${value ? "var(--mint-300)" : "var(--b-soft)"}`,
        color: value ? "var(--mint-300)" : "var(--fg-muted)",
        height: "26px",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "relative",
          display: "inline-block",
          width: 22,
          height: 12,
          borderRadius: 6,
          backgroundColor: value
            ? "var(--mint-700)"
            : "rgba(255,255,255,0.10)",
          border: `1px solid ${
            value ? "var(--mint-600)" : "rgba(255,255,255,0.18)"
          }`,
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 1,
            left: value ? 11 : 1,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: value
              ? "var(--mint-100)"
              : "rgba(255,255,255,0.65)",
            transition: "left 160ms ease",
          }}
        />
      </span>
      <span>Saúde</span>
    </button>
  );
}

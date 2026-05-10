"use client";

/** Switch deslizante (track + thumb). On = mint, off = neutro ou
 *  alerta (terracota) dependendo de `offIsAlert`.
 *  Útil pra campos boolean em tabelas — ex: ativo/inativo, flags. */
export function BooleanToggle({
  value,
  pending,
  onClick,
  offIsAlert = false,
  ariaLabel,
}: {
  value: boolean;
  pending?: boolean;
  onClick: (e: React.MouseEvent) => void;
  /** Se true, off vira terracota (alerta). Senão, off é cinza neutro. */
  offIsAlert?: boolean;
  ariaLabel?: string;
}) {
  // Alpha sutil pra evitar "tudo verde" em listas grandes (18+ rows).
  // Padrão Bling: affordance via tonalidade, não saturação cheia.
  const trackOn = "rgba(70,200,154,0.30)";
  const trackOnBorder = "rgba(70,200,154,0.50)";
  const trackOffAlert = "rgba(248,113,113,0.20)";
  const trackOffAlertBorder = "rgba(248,113,113,0.40)";
  const trackOffMuted = "rgba(255, 255, 255, 0.10)";
  const trackOffMutedBorder = "rgba(255, 255, 255, 0.18)";

  const TRACK_W = 30;
  const TRACK_H = 16;
  const THUMB = 12;
  const PAD = 2;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      role="switch"
      aria-checked={value}
      aria-label={ariaLabel ?? "Toggle"}
      title={value ? "Click para desativar" : "Click para ativar"}
      className="inline-flex items-center align-middle"
      style={{
        position: "relative",
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        backgroundColor: value
          ? trackOn
          : offIsAlert
            ? trackOffAlert
            : trackOffMuted,
        border: `1px solid ${
          value
            ? trackOnBorder
            : offIsAlert
              ? trackOffAlertBorder
              : trackOffMutedBorder
        }`,
        boxShadow: "none",
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.6 : 1,
        transition: "background-color 160ms ease, border-color 160ms ease",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          top: PAD - 1,
          left: value ? TRACK_W - THUMB - PAD - 1 : PAD - 1,
          width: THUMB,
          height: THUMB,
          borderRadius: THUMB / 2,
          backgroundColor: value
            ? "var(--mint-100)"
            : offIsAlert
              ? "var(--rose-300)"
              : "rgba(255,255,255,0.65)",
          transition: "left 160ms ease, background-color 160ms ease",
          boxShadow: "0 1px 2px rgba(0,0,0,0.30)",
        }}
      />
    </button>
  );
}

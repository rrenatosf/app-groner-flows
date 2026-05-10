"use client";
import { useEffect, useState } from "react";

const PREFIX = "health-toggle:";

/** Toggle de visibilidade de saúde por tabela. Persiste em localStorage.
 *  Default OFF (tabela limpa, foco no dado). User ativa quando precisa
 *  debug. */
export function useHealthToggle(tableKey: string): {
  showHealth: boolean;
  setShowHealth: (v: boolean) => void;
} {
  const [showHealth, setShowHealthState] = useState<boolean>(false);

  // Hidrata do localStorage no mount (evita SSR mismatch).
  useEffect(() => {
    try {
      const v = localStorage.getItem(PREFIX + tableKey);
      if (v === "1") setShowHealthState(true);
    } catch {}
  }, [tableKey]);

  function setShowHealth(v: boolean) {
    setShowHealthState(v);
    try {
      localStorage.setItem(PREFIX + tableKey, v ? "1" : "0");
    } catch {}
  }

  return { showHealth, setShowHealth };
}

import { useMemo } from "react";

/** Compara estados serializados do form (atual vs inicial). True quando
 *  diferentes. Usar pra mostrar badge "alterações pendentes". */
export function useDirtyForm<T>(initial: T, current: T): boolean {
  return useMemo(() => {
    try {
      return JSON.stringify(initial) !== JSON.stringify(current);
    } catch {
      return false;
    }
  }, [initial, current]);
}

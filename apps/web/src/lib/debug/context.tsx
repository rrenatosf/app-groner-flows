"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

const STORAGE_KEY = "groner_debug_enabled";

export type DebugLogEntry = {
  ts: number;
  label: string;
  data: unknown;
  url?: string;
  userAgent?: string;
};

type DebugCtx = {
  enabled: boolean;
  available: boolean;
  setEnabled: (v: boolean) => void;
  logs: DebugLogEntry[];
  log: (label: string, data?: unknown) => void;
  clear: () => void;
};

const Ctx = createContext<DebugCtx | null>(null);

// React 19: useSyncExternalStore lê localStorage de forma segura entre
// SSR e client sem useEffect "fake-sync".
function subscribeStorage(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", cb);
  return () => window.removeEventListener("storage", cb);
}
function readDebugFlag(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function DebugProvider({
  available,
  children,
}: {
  available: boolean;
  children: React.ReactNode;
}) {
  const stored = useSyncExternalStore(
    subscribeStorage,
    readDebugFlag,
    () => false,
  );
  const [override, setOverride] = useState<boolean | null>(null);
  const enabled = available && (override ?? stored);
  const [logs, setLogs] = useState<DebugLogEntry[]>([]);
  const setEnabledState = setOverride;

  const setEnabled = useCallback(
    (v: boolean) => {
      if (!available) return;
      setEnabledState(v);
      try {
        localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
        // Notifica useSyncExternalStore (storage event não dispara na
        // mesma aba — emitimos manualmente).
        window.dispatchEvent(new StorageEvent("storage"));
      } catch {
        /* ignore */
      }
    },
    [available, setEnabledState],
  );

  const log = useCallback(
    (label: string, data?: unknown) => {
      if (!enabled) return;
      const entry: DebugLogEntry = {
        ts: Date.now(),
        label,
        data,
        url: typeof window !== "undefined" ? window.location.pathname + window.location.search : undefined,
        userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      };
      setLogs((prev) => [...prev.slice(-199), entry]);

      console.log("[debug]", label, data);
    },
    [enabled],
  );

  const clear = useCallback(() => setLogs([]), []);

  const value = useMemo<DebugCtx>(
    () => ({ enabled, available, setEnabled, logs, log, clear }),
    [enabled, available, setEnabled, logs, log, clear],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDebug() {
  const v = useContext(Ctx);
  if (!v) {
    return {
      enabled: false,
      available: false,
      setEnabled: () => {},
      logs: [] as DebugLogEntry[],
      log: () => {},
      clear: () => {},
    } satisfies DebugCtx;
  }
  return v;
}

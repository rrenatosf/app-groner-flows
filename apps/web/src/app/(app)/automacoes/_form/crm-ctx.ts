"use client";

import { createContext, useContext } from "react";
import type { CrmStatus } from "@/server/actions/cliente-crm";
import type { CrmStatusSlot } from "@/lib/db/schema";

/** Contexto compartilhado pra dados do CRM (cache de status + estado live).
 *  Evita prop drilling em renderers recursivos de objeto aninhado — qualquer
 *  ColunaPickerLive em qualquer profundidade lê do mesmo lugar. */
export type CrmCtxValue = {
  crmColunas: CrmStatusSlot[] | null;
  liveList: CrmStatus[] | null;
  pendingLive: boolean;
  liveErr: string | null;
  refreshLive: () => void;
};

const FALLBACK: CrmCtxValue = {
  crmColunas: null,
  liveList: null,
  pendingLive: false,
  liveErr: null,
  refreshLive: () => {},
};

export const CrmCtx = createContext<CrmCtxValue>(FALLBACK);

export function useCrmCtx(): CrmCtxValue {
  return useContext(CrmCtx);
}

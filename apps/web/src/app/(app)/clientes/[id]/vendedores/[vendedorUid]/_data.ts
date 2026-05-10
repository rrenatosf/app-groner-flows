import "server-only";
import { cache } from "react";
import { loadVendedorOrNotFound } from "../../_data";

/** Carrega o vendedor específico do drilldown. Wrapper cacheado por
 *  request via react.cache. */
export const loadVendedor = cache(
  async (clienteId: number, vendedorUid: string) =>
    loadVendedorOrNotFound(clienteId, vendedorUid),
);

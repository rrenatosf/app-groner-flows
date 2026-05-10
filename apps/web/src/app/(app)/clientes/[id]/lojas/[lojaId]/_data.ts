import "server-only";
import { cache } from "react";
import { loadLojaOrNotFound } from "../../_data";

/** Carrega a loja específica do drilldown — wrapper cacheado por
 *  request via react.cache. Reusa loadLojaOrNotFound do parent. */
export const loadLoja = cache(
  async (clienteId: number, lojaId: string) =>
    loadLojaOrNotFound(clienteId, lojaId),
);

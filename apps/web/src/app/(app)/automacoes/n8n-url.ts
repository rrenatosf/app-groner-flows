/** Monta URL canônica de edição de workflow no N8N: `<host>/workflow/<id>`.
 *  Tolera `base_url` cadastrado com sufixo `/workflow` ou `/workflows` (caso
 *  o admin tenha colado a URL da listagem em vez do host puro). Sem isso,
 *  ficava `<host>/workflows/workflow/<id>` e o N8N retornava 404 client-side.
 *  Doc Notion "Link das Automações" (35c9084b98ef80358f40dc607c836c0f). */
export function buildN8nWorkflowUrl(
  baseUrl: string,
  workflowId: string,
): string {
  const cleaned = baseUrl.replace(/\/+$/, "").replace(/\/workflows?$/i, "");
  return `${cleaned}/workflow/${workflowId}`;
}

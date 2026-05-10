import "server-only";

/**
 * Cliente mínimo da API pública do n8n self-hosted (Groner).
 *
 * Usado pra duplicar o workflow "pai" SDR a cada nova automação criada.
 * Endpoint base: process.env.N8N_API_URL (ex: https://workflows.gronercrm.com.br/api/v1).
 * Auth: header `X-N8N-API-KEY`.
 */

type N8nWorkflow = {
  id: string;
  name: string;
  active?: boolean;
  nodes: unknown[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: unknown;
  pinData?: unknown;
  tags?: { id: string; name: string }[];
};

function envConfig() {
  const apiUrl = process.env.N8N_API_URL;
  const apiKey = process.env.N8N_API_KEY;
  const parentId = process.env.N8N_PARENT_WORKFLOW_ID;
  const projectId = process.env.N8N_PARENT_PROJECT_ID;
  const folderId = process.env.N8N_PARENT_FOLDER_ID;
  if (!apiUrl || !apiKey || !parentId) {
    return null;
  }
  return { apiUrl, apiKey, parentId, projectId, folderId };
}

export type DuplicateResult =
  | { ok: true; id: string; url: string }
  | { ok: false; error: string };

/**
 * Duplica o workflow pai (N8N_PARENT_WORKFLOW_ID) com um novo nome,
 * tenta colocar na mesma pasta/projeto. Workflow nasce **inativo** —
 * o admin ativa pela UI Groner Flows depois.
 */
export async function duplicateParentWorkflow(
  newName: string,
): Promise<DuplicateResult> {
  const cfg = envConfig();
  if (!cfg) {
    return {
      ok: false,
      error:
        "n8n não configurado (N8N_API_URL / N8N_API_KEY / N8N_PARENT_WORKFLOW_ID).",
    };
  }
  const { apiUrl, apiKey, parentId, projectId, folderId } = cfg;

  // 1) Lê o workflow pai
  let parent: N8nWorkflow;
  try {
    const r = await fetch(`${apiUrl}/workflows/${parentId}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-N8N-API-KEY": apiKey,
      },
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return {
        ok: false,
        error: `n8n GET workflow pai HTTP ${r.status}: ${t.slice(0, 200)}`,
      };
    }
    parent = (await r.json()) as N8nWorkflow;
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao ler workflow pai: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // 2) Cria cópia. n8n API pública aceita `name`, `nodes`, `connections`,
  //    `settings`. Se o instance suportar `projectId`/`parentFolderId` no
  //    body, vai pra pasta certa direto; senão criamos no root e movemos
  //    no passo 3.
  const createBody: Record<string, unknown> = {
    name: newName,
    nodes: parent.nodes,
    connections: parent.connections,
    settings: parent.settings ?? {},
  };
  if (projectId) createBody.projectId = projectId;
  if (folderId) createBody.parentFolderId = folderId;

  let created: { id?: string };
  try {
    const r = await fetch(`${apiUrl}/workflows`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-N8N-API-KEY": apiKey,
      },
      body: JSON.stringify(createBody),
      cache: "no-store",
    });
    if (!r.ok) {
      const t = await r.text().catch(() => "");
      return {
        ok: false,
        error: `n8n POST workflow HTTP ${r.status}: ${t.slice(0, 200)}`,
      };
    }
    created = (await r.json()) as { id?: string };
  } catch (e) {
    return {
      ok: false,
      error: `Falha ao criar cópia: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
  const newId = created.id;
  if (!newId) {
    return { ok: false, error: "n8n não retornou id do novo workflow." };
  }

  // 3) Best-effort: tenta mover pra pasta-alvo se o create não respeitou.
  if (projectId && folderId) {
    try {
      await fetch(
        `${apiUrl}/projects/${projectId}/folders/${folderId}/workflows/${newId}`,
        {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "X-N8N-API-KEY": apiKey,
          },
          cache: "no-store",
        },
      );
    } catch {
      // Silencioso — se o endpoint de move não existir, o workflow fica
      // no root do projeto. Admin reorganiza manualmente.
    }
  }

  // URL pública pra abrir no n8n
  const baseUi = apiUrl.replace(/\/api\/v\d+\/?$/, "");
  const url = `${baseUi}/workflow/${newId}`;
  return { ok: true, id: newId, url };
}

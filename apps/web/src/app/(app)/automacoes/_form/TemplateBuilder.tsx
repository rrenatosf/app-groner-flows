"use client";

import { useEffect, useRef, useState } from "react";
import {
  MAX_CAMPOS_POR_GRUPO,
  MAX_GRUPOS,
  type DadosConfigGroup,
} from "../dados-config-shape";
import { isSnakeCase, toSnakeCase } from "../dados-config-form";

/** Tempo (ms) que a borda âmbar de "auto-formatado" fica visível após
 *  blur. Dá tempo do user perceber a mudança sem ficar pra sempre. */
const FLASH_MS = 2500;

/** Tamanho máximo de um comentário (sincronizado com sanitização em
 *  `actions.ts`). Acima disso é cortado. */
const MAX_COMENTARIO_LEN = 500;

/** Tipos suportados pelo builder. `array` aqui = `array-string` no form
 *  interno (default). `object` abre sub-nível com sub-items recursivos. */
type ItemType = "string" | "number" | "boolean" | "array" | "object";

type DraftItem = {
  id: string;
  name: string;
  type: ItemType;
  /** Valor padrão do campo (vai pro template como default copiado pra cada
   *  instância). Não usado quando `type === "object"` (valor = sub-items). */
  value: unknown;
  /** Sub-items quando `type === "object"`. Undefined caso contrário. */
  items?: DraftItem[];
};

type DraftGroup = {
  id: string;
  name: string;
  items: DraftItem[];
};

function nextId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function inferTypeFromValue(v: unknown): ItemType {
  if (typeof v === "number") return "number";
  if (typeof v === "boolean") return "boolean";
  if (Array.isArray(v)) return "array";
  if (v !== null && typeof v === "object") return "object";
  return "string";
}

function defaultValueFor(type: ItemType): unknown {
  switch (type) {
    case "string":
      return "";
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
  }
}

function deserializeItems(value: unknown): DraftItem[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => {
    const type = inferTypeFromValue(v);
    return {
      id: nextId(),
      name: k,
      type,
      value: type === "object" ? {} : v,
      items: type === "object" ? deserializeItems(v) : undefined,
    };
  });
}

function deserialize(value: DadosConfigGroup[]): DraftGroup[] {
  return value.map((g) => {
    const name = Object.keys(g)[0] ?? "";
    const inner = (g[name] ?? {}) as Record<string, unknown>;
    return {
      id: nextId(),
      name,
      items: deserializeItems(inner),
    };
  });
}

function serializeItems(items: DraftItem[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const it of items) {
    const key = it.name.trim();
    if (!key) continue;
    if (it.type === "object") {
      out[key] = serializeItems(it.items ?? []);
    } else {
      out[key] = coerceValueByType(it.value, it.type);
    }
  }
  return out;
}

/** Coage `value` no tipo declarado. Garante shape consistente mesmo se
 *  user trocou tipo mid-edit e ficou valor de outro tipo no state. */
function coerceValueByType(value: unknown, type: ItemType): unknown {
  switch (type) {
    case "string":
      return typeof value === "string" ? value : "";
    case "number":
      return typeof value === "number" && !Number.isNaN(value) ? value : 0;
    case "boolean":
      return typeof value === "boolean" ? value : false;
    case "array":
      return Array.isArray(value) ? value : [];
    case "object":
      return {};
  }
}

function serialize(draft: DraftGroup[]): DadosConfigGroup[] {
  const out: DadosConfigGroup[] = [];
  for (const g of draft) {
    const name = g.name.trim();
    if (!name) continue;
    out.push({ [name]: serializeItems(g.items) });
  }
  return out;
}

/** Constrói path do meta a partir da cadeia de ancestrais + nome atual.
 *  Ex: `["dados_do_cliente"], "telefone"` → `"dados_do_cliente.telefone"`.
 *
 *  Retorna `""` se o nome atual OU qualquer ancestor estiver vazio. Esse
 *  short-circuit evita colisão: antes, item sem nome dentro de grupo
 *  "X" gerava path "X" (path do grupo), e o comentário do item acabava
 *  sobrescrevendo o do grupo. Agora path vazio desabilita o input de
 *  comentário até o user preencher os nomes. */
function buildPath(ancestors: readonly string[], current: string): string {
  const c = current.trim();
  if (c === "") return "";
  for (const a of ancestors) {
    if (a.trim() === "") return "";
  }
  return [...ancestors.map((s) => s.trim()), c].join(".");
}

/** Clona item recursivamente com IDs novos. Mantém nome, tipo, valor e
 *  sub-items. Usado pelo botão de duplicar. */
function cloneItem(it: DraftItem, nameOverride?: string): DraftItem {
  return {
    id: nextId(),
    name: nameOverride ?? it.name,
    type: it.type,
    value:
      typeof it.value === "object" && it.value !== null
        ? (JSON.parse(JSON.stringify(it.value)) as unknown)
        : it.value,
    items: it.items ? it.items.map((c) => cloneItem(c)) : undefined,
  };
}

function cloneGroup(g: DraftGroup, nameOverride?: string): DraftGroup {
  return {
    id: nextId(),
    name: nameOverride ?? g.name,
    items: g.items.map((c) => cloneItem(c)),
  };
}

/** Coleta IDs de todos os items + descendentes recursivamente. Usado pra
 *  expand/collapse all em escopo (todos os items dentro de um nível). */
function descendantIdsOfItems(items: DraftItem[]): string[] {
  const ids: string[] = [];
  for (const it of items) {
    ids.push(it.id);
    if (it.items) ids.push(...descendantIdsOfItems(it.items));
  }
  return ids;
}

/** Gera nome único entre irmãos. Append `_2`, `_3`, ... se já existir. */
function findUniqueSibling(base: string, siblings: string[]): string {
  const trimmed = base.trim();
  if (trimmed === "") return "";
  if (!siblings.includes(trimmed)) return trimmed;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${trimmed}_${i}`;
    if (!siblings.includes(candidate)) return candidate;
  }
  return `${trimmed}_${Date.now()}`;
}

/** Copia entries de meta de um path antigo pra um novo (mantém entries
 *  originais). Útil ao duplicar item: comentários vão junto. */
function duplicateMetaPaths(
  meta: Record<string, string>,
  oldPath: string,
  newPath: string,
): Record<string, string> {
  if (oldPath === "" || newPath === "" || oldPath === newPath) return meta;
  const out = { ...meta };
  for (const [k, v] of Object.entries(meta)) {
    if (k === oldPath) {
      out[newPath] = v;
    } else if (k.startsWith(oldPath + ".")) {
      out[newPath + k.slice(oldPath.length)] = v;
    }
  }
  return out;
}

/** Renomeia path no meta (e descendentes). Usado quando user muda nome
 *  de grupo/item: comentário acompanha o item renomeado em vez de virar
 *  órfão. */
function renameMetaPath(
  meta: Record<string, string>,
  oldPath: string,
  newPath: string,
): Record<string, string> {
  if (oldPath === newPath || oldPath === "") return meta;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === oldPath) {
      if (newPath !== "") out[newPath] = v;
    } else if (k.startsWith(oldPath + ".")) {
      if (newPath !== "") {
        out[newPath + k.slice(oldPath.length)] = v;
      }
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Remove path + descendentes do meta. Usado em delete e mudança de tipo
 *  (object → primitivo descarta sub-items, então remove seus comentários). */
function deleteMetaPath(
  meta: Record<string, string>,
  path: string,
): Record<string, string> {
  if (path === "") return meta;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (k === path) continue;
    if (k.startsWith(path + ".")) continue;
    out[k] = v;
  }
  return out;
}

/** Builder visual pra montar template + comentários. Comentários ficam em
 *  `meta` (Record path → texto). Path = `grupo.item.subitem`. Reordenação
 *  via setas ↑↓ não muda paths (path usa nomes, não índices). */
export function TemplateBuilder({
  value,
  onChange,
  meta,
  onMetaChange,
  disabled,
}: {
  value: DadosConfigGroup[];
  onChange: (next: DadosConfigGroup[]) => void;
  meta: Record<string, string>;
  onMetaChange: (next: Record<string, string>) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<DraftGroup[]>(() => deserialize(value));
  const lastEmittedRef = useRef<string>(JSON.stringify(value));
  const [flashIds, setFlashIds] = useState<Set<string>>(new Set());
  // IDs cujos inputs já foram blurados ao menos uma vez — validação só
  // aparece visualmente depois disso (não polui campos pristine).
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());
  // IDs colapsados (default: todos expandidos). User clica chevron pra
  // recolher grupo ou item objeto — esconde conteúdo aninhado.
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  function markTouched(id: string) {
    setTouchedIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function collectAllIds(): Set<string> {
    const ids = new Set<string>();
    function walk(items: DraftItem[]) {
      for (const it of items) {
        ids.add(it.id);
        if (it.items) walk(it.items);
      }
    }
    for (const g of draft) {
      ids.add(g.id);
      walk(g.items);
    }
    return ids;
  }

  function collapseAll() {
    setCollapsedIds(collectAllIds());
  }

  function expandAll() {
    setCollapsedIds(new Set());
  }

  function collapseScopeIds(ids: string[]) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.add(id);
      return next;
    });
  }

  function expandScopeIds(ids: string[]) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) next.delete(id);
      return next;
    });
  }

  useEffect(() => {
    const incoming = JSON.stringify(value);
    if (incoming === lastEmittedRef.current) return;
    setDraft(deserialize(value));
    lastEmittedRef.current = incoming;
  }, [value]);

  function flashId(id: string) {
    setFlashIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    window.setTimeout(() => {
      setFlashIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, FLASH_MS);
  }

  function commit(next: DraftGroup[]) {
    setDraft(next);
    const serialized = serialize(next);
    lastEmittedRef.current = JSON.stringify(serialized);
    onChange(serialized);
  }

  function commitMeta(next: Record<string, string>) {
    onMetaChange(next);
  }

  // --- helpers de mutação imutável em árvore de items ---

  function updateItemAtPath(
    items: DraftItem[],
    iid: string,
    fn: (it: DraftItem) => DraftItem,
  ): { items: DraftItem[]; found: boolean } {
    let found = false;
    const next = items.map((it) => {
      if (it.id === iid) {
        found = true;
        return fn(it);
      }
      if (it.type === "object" && it.items) {
        const r = updateItemAtPath(it.items, iid, fn);
        if (r.found) {
          found = true;
          return { ...it, items: r.items };
        }
      }
      return it;
    });
    return { items: next, found };
  }

  /** Acha item por id e retorna ele + a cadeia de ancestrais (nomes). */
  function findItemWithAncestors(
    items: DraftItem[],
    iid: string,
    ancestors: string[],
  ): { item: DraftItem; ancestors: string[] } | null {
    for (const it of items) {
      if (it.id === iid) return { item: it, ancestors };
      if (it.type === "object" && it.items) {
        const r = findItemWithAncestors(it.items, iid, [
          ...ancestors,
          it.name,
        ]);
        if (r) return r;
      }
    }
    return null;
  }

  function removeItemAtPath(
    items: DraftItem[],
    iid: string,
  ): { items: DraftItem[]; found: boolean } {
    let found = false;
    const next: DraftItem[] = [];
    for (const it of items) {
      if (it.id === iid) {
        found = true;
        continue;
      }
      if (it.type === "object" && it.items) {
        const r = removeItemAtPath(it.items, iid);
        if (r.found) {
          found = true;
          next.push({ ...it, items: r.items });
          continue;
        }
      }
      next.push(it);
    }
    return { items: next, found };
  }

  /** Move item por id ±1 posição. Procura recursivamente. */
  function moveItemAtPath(
    items: DraftItem[],
    iid: string,
    delta: -1 | 1,
  ): { items: DraftItem[]; moved: boolean } {
    const idx = items.findIndex((i) => i.id === iid);
    if (idx !== -1) {
      const newIdx = idx + delta;
      if (newIdx < 0 || newIdx >= items.length) {
        return { items, moved: false };
      }
      const next = [...items];
      const [moved] = next.splice(idx, 1);
      next.splice(newIdx, 0, moved);
      return { items: next, moved: true };
    }
    // Não está nesse nível — desce.
    let movedDeep = false;
    const next = items.map((it) => {
      if (it.type === "object" && it.items && !movedDeep) {
        const r = moveItemAtPath(it.items, iid, delta);
        if (r.moved) {
          movedDeep = true;
          return { ...it, items: r.items };
        }
      }
      return it;
    });
    return { items: next, moved: movedDeep };
  }

  // --- mutadores ---

  function addGroup() {
    if (draft.length >= MAX_GRUPOS) return;
    commit([...draft, { id: nextId(), name: "", items: [] }]);
  }

  function removeGroup(gid: string) {
    const g = draft.find((x) => x.id === gid);
    commit(draft.filter((x) => x.id !== gid));
    if (g && g.name.trim() !== "") {
      commitMeta(deleteMetaPath(meta, g.name.trim()));
    }
  }

  function moveGroup(gid: string, delta: -1 | 1) {
    const idx = draft.findIndex((g) => g.id === gid);
    if (idx === -1) return;
    const newIdx = idx + delta;
    if (newIdx < 0 || newIdx >= draft.length) return;
    const next = [...draft];
    const [moved] = next.splice(idx, 1);
    next.splice(newIdx, 0, moved);
    commit(next);
  }

  function setGroupName(gid: string, name: string) {
    commit(draft.map((g) => (g.id === gid ? { ...g, name } : g)));
  }

  function normalizeGroupName(gid: string) {
    const g = draft.find((x) => x.id === gid);
    if (!g) return;
    const trimmed = g.name.trim();
    if (trimmed === "") return;
    const snake = toSnakeCase(trimmed);
    if (snake === g.name) return;
    const oldPath = g.name.trim();
    commit(draft.map((x) => (x.id === gid ? { ...x, name: snake } : x)));
    if (oldPath !== "") {
      commitMeta(renameMetaPath(meta, oldPath, snake));
    }
    flashId(gid);
  }

  function addItemToGroup(gid: string) {
    commit(
      draft.map((g) => {
        if (g.id !== gid) return g;
        if (g.items.length >= MAX_CAMPOS_POR_GRUPO) return g;
        return {
          ...g,
          items: [
            ...g.items,
            { id: nextId(), name: "", type: "string", value: "" },
          ],
        };
      }),
    );
  }

  function addSubItem(parentId: string) {
    commit(
      draft.map((g) => {
        const r = updateItemAtPath(g.items, parentId, (it) => {
          if (it.type !== "object") return it;
          const sub = it.items ?? [];
          if (sub.length >= MAX_CAMPOS_POR_GRUPO) return it;
          return {
            ...it,
            items: [
              ...sub,
              { id: nextId(), name: "", type: "string", value: "" },
            ],
          };
        });
        return r.found ? { ...g, items: r.items } : g;
      }),
    );
  }

  function removeItem(iid: string) {
    // Path do item antes de remover (pra limpar meta dele + descendentes).
    let pathToDelete = "";
    for (const g of draft) {
      const found = findItemWithAncestors(g.items, iid, [g.name]);
      if (found) {
        pathToDelete = buildPath(found.ancestors, found.item.name);
        break;
      }
    }
    commit(
      draft.map((g) => {
        const r = removeItemAtPath(g.items, iid);
        return r.found ? { ...g, items: r.items } : g;
      }),
    );
    if (pathToDelete !== "") {
      commitMeta(deleteMetaPath(meta, pathToDelete));
    }
  }

  function moveItem(iid: string, delta: -1 | 1) {
    let moved = false;
    const next = draft.map((g) => {
      if (moved) return g;
      const r = moveItemAtPath(g.items, iid, delta);
      if (r.moved) {
        moved = true;
        return { ...g, items: r.items };
      }
      return g;
    });
    if (moved) commit(next);
  }

  function setItemName(iid: string, name: string) {
    commit(
      draft.map((g) => {
        const r = updateItemAtPath(g.items, iid, (it) => ({ ...it, name }));
        return r.found ? { ...g, items: r.items } : g;
      }),
    );
  }

  function normalizeItemName(iid: string) {
    let target: { item: DraftItem; ancestors: string[] } | null = null;
    for (const g of draft) {
      target = findItemWithAncestors(g.items, iid, [g.name]);
      if (target) break;
    }
    if (!target) return;
    const trimmed = target.item.name.trim();
    if (trimmed === "") return;
    const snake = toSnakeCase(trimmed);
    if (snake === target.item.name) return;
    const oldPath = buildPath(target.ancestors, target.item.name);
    const newPath = buildPath(target.ancestors, snake);
    commit(
      draft.map((g) => {
        const r = updateItemAtPath(g.items, iid, (it) => ({
          ...it,
          name: snake,
        }));
        return r.found ? { ...g, items: r.items } : g;
      }),
    );
    if (oldPath !== "" && oldPath !== newPath) {
      commitMeta(renameMetaPath(meta, oldPath, newPath));
    }
    flashId(iid);
  }

  function setItemType(iid: string, type: ItemType) {
    let pathToClearChildren = "";
    if (type !== "object") {
      // Mudou de object → outro: limpa meta dos sub-items que serão dropados.
      for (const g of draft) {
        const found = findItemWithAncestors(g.items, iid, [g.name]);
        if (found && found.item.type === "object") {
          pathToClearChildren = buildPath(
            found.ancestors,
            found.item.name,
          );
        }
        if (found) break;
      }
    }
    commit(
      draft.map((g) => {
        const r = updateItemAtPath(g.items, iid, (it) => {
          if (it.type === type) return it;
          if (type === "object") {
            return { ...it, type, items: it.items ?? [], value: {} };
          }
          const { items: _drop, ...rest } = it;
          void _drop;
          return { ...rest, type, value: defaultValueFor(type) };
        });
        return r.found ? { ...g, items: r.items } : g;
      }),
    );
    if (pathToClearChildren !== "") {
      // Remove só os descendentes (não o item em si).
      const next: Record<string, string> = {};
      for (const [k, v] of Object.entries(meta)) {
        if (k.startsWith(pathToClearChildren + ".")) continue;
        next[k] = v;
      }
      commitMeta(next);
    }
  }

  function setItemValue(iid: string, value: unknown) {
    commit(
      draft.map((g) => {
        const r = updateItemAtPath(g.items, iid, (it) => ({ ...it, value }));
        return r.found ? { ...g, items: r.items } : g;
      }),
    );
  }

  function duplicateGroup(gid: string) {
    const idx = draft.findIndex((g) => g.id === gid);
    if (idx === -1) return;
    if (draft.length >= MAX_GRUPOS) return;
    const orig = draft[idx];
    const siblings = draft.map((g) => g.name.trim());
    const newName = findUniqueSibling(orig.name.trim(), siblings);
    const cloned = cloneGroup(orig, newName);
    const next = [...draft];
    next.splice(idx + 1, 0, cloned);
    commit(next);
    const oldPath = orig.name.trim();
    if (oldPath !== "" && newName !== "" && oldPath !== newName) {
      commitMeta(duplicateMetaPaths(meta, oldPath, newName));
    }
  }

  function duplicateItem(iid: string) {
    type DupInfo = {
      newName: string;
      oldPath: string;
      newPath: string;
    } | null;

    function tryDup(
      items: DraftItem[],
      ancestors: string[],
    ): { items: DraftItem[]; info: DupInfo } {
      const idx = items.findIndex((i) => i.id === iid);
      if (idx !== -1) {
        const orig = items[idx];
        if (items.length >= MAX_CAMPOS_POR_GRUPO) {
          return { items, info: null };
        }
        const siblings = items.map((i) => i.name.trim());
        const newName = findUniqueSibling(orig.name.trim(), siblings);
        const cloned = cloneItem(orig, newName);
        const next = [...items];
        next.splice(idx + 1, 0, cloned);
        return {
          items: next,
          info: {
            newName,
            oldPath: buildPath(ancestors, orig.name),
            newPath: buildPath(ancestors, newName),
          },
        };
      }
      let info: DupInfo = null;
      const next = items.map((it) => {
        if (info) return it;
        if (it.type === "object" && it.items) {
          const r = tryDup(it.items, [...ancestors, it.name]);
          if (r.info) {
            info = r.info;
            return { ...it, items: r.items };
          }
        }
        return it;
      });
      return { items: next, info };
    }

    let dupInfo: DupInfo = null;
    const nextDraft = draft.map((g) => {
      if (dupInfo) return g;
      const r = tryDup(g.items, [g.name]);
      if (r.info) {
        dupInfo = r.info;
        return { ...g, items: r.items };
      }
      return g;
    });
    if (dupInfo) {
      commit(nextDraft);
      const info: { newName: string; oldPath: string; newPath: string } =
        dupInfo;
      if (
        info.oldPath !== "" &&
        info.newPath !== "" &&
        info.oldPath !== info.newPath
      ) {
        commitMeta(duplicateMetaPaths(meta, info.oldPath, info.newPath));
      }
    }
  }

  function setComentario(path: string, value: string) {
    if (path === "") return;
    const trimmed = value.slice(0, MAX_COMENTARIO_LEN);
    const next = { ...meta };
    if (trimmed.trim() === "") {
      delete next[path];
    } else {
      next[path] = trimmed;
    }
    commitMeta(next);
  }

  const totalCollapsibleIds = collectAllIds();
  const allCollapsed =
    totalCollapsibleIds.size > 0 &&
    Array.from(totalCollapsibleIds).every((id) => collapsedIds.has(id));
  const noneCollapsed = collapsedIds.size === 0;

  return (
    <div className="space-y-6">
      {draft.length > 0 && (
        <div className="flex items-center gap-1.5 -mb-2">
          <button
            type="button"
            onClick={expandAll}
            disabled={disabled || noneCollapsed}
            className="text-[11px] px-2 py-1 rounded-md disabled:opacity-40"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
            title="Expandir todos os grupos e itens"
          >
            ▾ Expandir tudo
          </button>
          <button
            type="button"
            onClick={collapseAll}
            disabled={disabled || allCollapsed}
            className="text-[11px] px-2 py-1 rounded-md disabled:opacity-40"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
            title="Recolher todos os grupos e itens"
          >
            ▸ Recolher tudo
          </button>
        </div>
      )}
      {draft.length === 0 && (
        <div
          className="text-[12px] px-3 py-4 rounded-md text-center"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-muted)",
            border: "1px dashed var(--b-base)",
          }}
        >
          Nenhum grupo ainda. Clique em &quot;Adicionar grupo&quot; abaixo.
        </div>
      )}

      {draft.map((g, gi) => {
        const groupTrim = g.name.trim();
        const dupGroup =
          groupTrim !== "" &&
          draft.findIndex(
            (x, xi) => xi !== gi && x.name.trim() === groupTrim,
          ) !== -1;
        const groupInvalid = groupTrim !== "" && !isSnakeCase(groupTrim);
        const groupFlash = flashIds.has(g.id);
        const groupTouched = touchedIds.has(g.id);
        const showGroupErr = groupTouched && (groupInvalid || dupGroup);
        const groupPath = groupTrim;
        const groupComentario = groupPath !== "" ? meta[groupPath] ?? "" : "";
        const groupCollapsed = collapsedIds.has(g.id);

        return (
          <div
            key={g.id}
            className="rounded-md p-4 space-y-3"
            style={{
              backgroundColor: "var(--ink-2)",
              border: "1px solid var(--b-soft)",
            }}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <NameTypeCell
                  name={g.name}
                  onNameChange={(v) => setGroupName(g.id, v)}
                  onNameBlur={() => {
                    markTouched(g.id);
                    normalizeGroupName(g.id);
                  }}
                  namePlaceholder="ex: dados_do_cliente"
                  type="object"
                  readOnly
                  invalid={showGroupErr}
                  flash={groupFlash}
                  disabled={disabled}
                  ariaLabel="Título do grupo"
                  comentarioPath={groupPath}
                  comentarioValue={groupComentario}
                  onComentarioChange={setComentario}
                  comentarioDisabled={disabled || groupPath === ""}
                  comentarioPlaceholder={
                    groupPath === ""
                      ? "preencha o título antes de comentar"
                      : "comentário pro grupo (opcional)"
                  }
                  expanded={!groupCollapsed}
                  collapsed={groupCollapsed}
                  onToggleCollapse={() => toggleCollapse(g.id)}
                  onMoveUp={() => moveGroup(g.id, -1)}
                  onMoveDown={() => moveGroup(g.id, 1)}
                  upDisabled={gi === 0}
                  downDisabled={gi === draft.length - 1}
                  onDuplicate={() => duplicateGroup(g.id)}
                  duplicateDisabled={draft.length >= MAX_GRUPOS}
                  onRemove={() => removeGroup(g.id)}
                  removeConfirmMessage={`Remover o grupo "${g.name.trim() || "(sem nome)"}" e tudo dentro dele?`}
                />
              </div>
            </div>
            {groupFlash && (
              <div
                className="text-[11px] mb-2"
                style={{ color: "var(--amber-300)" }}
              >
                Formatado automaticamente — confirme se ficou como você
                queria.
              </div>
            )}

            {!groupCollapsed && (
              <div style={{ marginLeft: "28px" }} className="space-y-3">
                <ItemsList
                  items={g.items}
                  depth={0}
                  ancestors={[g.name]}
                  meta={meta}
                  disabled={disabled}
                  flashIds={flashIds}
                  touchedIds={touchedIds}
                  collapsedIds={collapsedIds}
                  collapsedIdsSet={collapsedIds}
                  onTouch={markTouched}
                  onToggleCollapse={toggleCollapse}
                  onScopeExpand={expandScopeIds}
                  onScopeCollapse={collapseScopeIds}
                  onAdd={() => addItemToGroup(g.id)}
                  onAddSub={addSubItem}
                  onRemove={removeItem}
                  onMove={moveItem}
                  onDuplicate={duplicateItem}
                  onSetName={setItemName}
                  onSetType={setItemType}
                  onSetValue={setItemValue}
                  onNormalize={normalizeItemName}
                  onSetComentario={setComentario}
                />
              </div>
            )}
          </div>
        );
      })}

      <button
        type="button"
        onClick={addGroup}
        disabled={disabled || draft.length >= MAX_GRUPOS}
        className="text-[12px] px-3 py-1.5 rounded-md disabled:opacity-50"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--mint-300)",
          border: "1px dashed var(--b-base)",
        }}
        title={
          draft.length >= MAX_GRUPOS
            ? `Máximo ${MAX_GRUPOS} grupos`
            : "Adicionar novo grupo"
        }
      >
        + Adicionar grupo
      </button>
    </div>
  );
}

/** Renderiza lista de items recursivamente. Indentação visual por `depth`.
 *  `ancestors` = cadeia de nomes do grupo até o item parent (usado pra
 *  montar path do comentário). */
function ItemsList({
  items,
  depth,
  ancestors,
  meta,
  disabled,
  flashIds,
  touchedIds,
  collapsedIds,
  collapsedIdsSet,
  onTouch,
  onToggleCollapse,
  onScopeExpand,
  onScopeCollapse,
  onAdd,
  onAddSub,
  onRemove,
  onMove,
  onDuplicate,
  onSetName,
  onSetType,
  onSetValue,
  onNormalize,
  onSetComentario,
}: {
  items: DraftItem[];
  depth: number;
  ancestors: string[];
  meta: Record<string, string>;
  disabled?: boolean;
  flashIds: Set<string>;
  touchedIds: Set<string>;
  collapsedIds: Set<string>;
  collapsedIdsSet: Set<string>;
  onTouch: (id: string) => void;
  onToggleCollapse: (id: string) => void;
  onScopeExpand: (ids: string[]) => void;
  onScopeCollapse: (ids: string[]) => void;
  onAdd: () => void;
  onAddSub: (parentId: string) => void;
  onRemove: (iid: string) => void;
  onMove: (iid: string, delta: -1 | 1) => void;
  onDuplicate: (iid: string) => void;
  onSetName: (iid: string, name: string) => void;
  onSetType: (iid: string, type: ItemType) => void;
  onSetValue: (iid: string, value: unknown) => void;
  onNormalize: (iid: string) => void;
  onSetComentario: (path: string, value: string) => void;
}) {
  const itemTrims = items.map((i) => i.name.trim());
  const indentStyle =
    depth > 0
      ? {
          marginLeft: "16px",
          paddingLeft: "14px",
          paddingTop: "8px",
          borderLeft: "1px solid var(--b-soft)",
        }
      : undefined;
  const addLabel = depth === 0 ? "+ Adicionar item" : "+ Adicionar sub-item";
  const placeholder =
    depth === 0
      ? "nome do item (ex: telefone)"
      : "nome do sub-item (ex: id)";
  const emptyMsg =
    depth === 0
      ? 'Sem itens. Clique em "+ Adicionar item" abaixo.'
      : 'Sem sub-itens. Clique em "+ Adicionar sub-item" abaixo.';

  return (
    <div style={indentStyle}>
      {items.length === 0 && (
        <div
          className="text-[11.5px] px-2 py-2 rounded-md text-center mb-1.5"
          style={{
            backgroundColor: "var(--ink-3)",
            color: "var(--fg-subtle)",
            border: "1px dashed var(--b-soft)",
          }}
        >
          {emptyMsg}
        </div>
      )}

      <div className="space-y-6">
        {items.map((it, ii) => {
          const itemTrim = it.name.trim();
          const dupItem =
            itemTrim !== "" &&
            itemTrims.findIndex(
              (x, xi) => xi !== ii && x === itemTrim,
            ) !== -1;
          const itemInvalid =
            itemTrim !== "" && !isSnakeCase(itemTrim);
          const itemFlash = flashIds.has(it.id);
          const itemTouched = touchedIds.has(it.id);
          const showItemErr = itemTouched && (itemInvalid || dupItem);
          const itemPath = buildPath(ancestors, it.name);
          const itemComentario = itemPath !== "" ? meta[itemPath] ?? "" : "";

          const itemCollapsed = collapsedIds.has(it.id);
          const itemLabelTrim = it.name.trim();
          const isObjectItem = it.type === "object";
          return (
            <div key={it.id} className="space-y-1">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <NameTypeCell
                    name={it.name}
                    onNameChange={(v) => onSetName(it.id, v)}
                    onNameBlur={() => {
                      onTouch(it.id);
                      onNormalize(it.id);
                    }}
                    namePlaceholder={placeholder}
                    type={it.type}
                    onTypeChange={(t) => onSetType(it.id, t)}
                    invalid={showItemErr}
                    flash={itemFlash}
                    disabled={disabled}
                    ariaLabel="Nome do item"
                    comentarioPath={itemPath}
                    comentarioValue={itemComentario}
                    onComentarioChange={onSetComentario}
                    comentarioDisabled={disabled || itemPath === ""}
                    comentarioPlaceholder={
                      itemPath === ""
                        ? "preencha o nome antes de comentar"
                        : "comentário pro item (opcional)"
                    }
                    itemValue={it.value}
                    onItemValueChange={(v) => onSetValue(it.id, v)}
                    expanded={!itemCollapsed}
                    collapsed={itemCollapsed}
                    onToggleCollapse={() => onToggleCollapse(it.id)}
                    onMoveUp={() => onMove(it.id, -1)}
                    onMoveDown={() => onMove(it.id, 1)}
                    upDisabled={ii === 0}
                    downDisabled={ii === items.length - 1}
                    onDuplicate={() => onDuplicate(it.id)}
                    duplicateDisabled={items.length >= MAX_CAMPOS_POR_GRUPO}
                    onRemove={() => onRemove(it.id)}
                    removeConfirmMessage={`Remover o item "${itemLabelTrim || "(sem nome)"}"?${it.type === "object" ? "\n\nOs sub-itens também serão removidos." : ""}`}
                  />
                </div>
              </div>
              {itemFlash && (
                <div
                  className="text-[11px]"
                  style={{ color: "var(--amber-300)" }}
                >
                  Formatado automaticamente — confirme.
                </div>
              )}

              <div style={{ marginLeft: "36px" }} className="space-y-2">
                {it.type === "object" && !itemCollapsed && (
                  <ItemsList
                    items={it.items ?? []}
                    depth={depth + 1}
                    ancestors={[...ancestors, it.name]}
                    meta={meta}
                    disabled={disabled}
                    flashIds={flashIds}
                    touchedIds={touchedIds}
                    collapsedIds={collapsedIds}
                    onTouch={onTouch}
                    onToggleCollapse={onToggleCollapse}
                    onScopeExpand={onScopeExpand}
                    onScopeCollapse={onScopeCollapse}
                    collapsedIdsSet={collapsedIdsSet}
                    onAdd={() => onAddSub(it.id)}
                    onAddSub={onAddSub}
                    onRemove={onRemove}
                    onMove={onMove}
                    onDuplicate={onDuplicate}
                    onSetName={onSetName}
                    onSetType={onSetType}
                    onSetValue={onSetValue}
                    onNormalize={onNormalize}
                    onSetComentario={onSetComentario}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <ScopeActions
        items={items}
        depth={depth}
        addLabel={addLabel}
        canAdd={items.length < MAX_CAMPOS_POR_GRUPO}
        addMaxMessage={`Máximo ${MAX_CAMPOS_POR_GRUPO} itens por nível`}
        disabled={disabled}
        collapsedIdsSet={collapsedIdsSet}
        onAdd={onAdd}
        onScopeExpand={onScopeExpand}
        onScopeCollapse={onScopeCollapse}
      />
    </div>
  );
}

/** Footer de cada ItemsList. Centraliza: + Adicionar + Expandir/Recolher
 *  escopo. Escopo = todos os items descendentes desse nível. */
function ScopeActions({
  items,
  depth,
  addLabel,
  canAdd,
  addMaxMessage,
  disabled,
  collapsedIdsSet,
  onAdd,
  onScopeExpand,
  onScopeCollapse,
}: {
  items: DraftItem[];
  depth: number;
  addLabel: string;
  canAdd: boolean;
  addMaxMessage: string;
  disabled?: boolean;
  collapsedIdsSet: Set<string>;
  onAdd: () => void;
  onScopeExpand: (ids: string[]) => void;
  onScopeCollapse: (ids: string[]) => void;
}) {
  const scopeIds = descendantIdsOfItems(items);
  const hasScope = scopeIds.length > 0;
  const allCollapsed =
    hasScope && scopeIds.every((id) => collapsedIdsSet.has(id));
  const noneCollapsed =
    hasScope && scopeIds.every((id) => !collapsedIdsSet.has(id));

  return (
    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled || !canAdd}
        className="text-[11px] px-2 py-1 rounded-md disabled:opacity-50"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--mint-300)",
          border: "1px dashed var(--b-base)",
        }}
        title={!canAdd ? addMaxMessage : addLabel}
      >
        {addLabel}
      </button>
      {hasScope && (
        <>
          <button
            type="button"
            onClick={() => onScopeExpand(scopeIds)}
            disabled={disabled || noneCollapsed}
            className="text-[11px] px-2 py-1 rounded-md disabled:opacity-40"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
            title={
              depth === 0
                ? "Expandir todos os itens deste grupo"
                : "Expandir todos os sub-itens"
            }
          >
            ▾ Expandir
          </button>
          <button
            type="button"
            onClick={() => onScopeCollapse(scopeIds)}
            disabled={disabled || allCollapsed}
            className="text-[11px] px-2 py-1 rounded-md disabled:opacity-40"
            style={{
              backgroundColor: "var(--ink-3)",
              color: "var(--fg-muted)",
              border: "1px solid var(--b-soft)",
            }}
            title={
              depth === 0
                ? "Recolher todos os itens deste grupo"
                : "Recolher todos os sub-itens"
            }
          >
            ▸ Recolher
          </button>
        </>
      )}
    </div>
  );
}

/** Label exibido pra cada tipo no chip. Texto plano, sem cor — mantém
 *  estética sóbria do design system. */
const TYPE_LABELS: Record<ItemType, string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  array: "array",
  object: "objeto",
};

const CHEVRON_DOWN_SVG =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%23a8a29e' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>\")";

/** Cell combinada com [nome | tipo] no mesmo bloco bordered. Tipo fica
 *  como split à direita com separador vertical. Read-only quando é grupo
 *  (sempre objeto). */
function NameTypeCell({
  name,
  onNameChange,
  onNameBlur,
  namePlaceholder,
  type,
  onTypeChange,
  readOnly,
  invalid,
  flash,
  disabled,
  ariaLabel,
  comentarioPath,
  comentarioValue,
  onComentarioChange,
  comentarioDisabled,
  comentarioPlaceholder,
  itemValue,
  onItemValueChange,
  expanded,
  onMoveUp,
  onMoveDown,
  upDisabled,
  downDisabled,
  onDuplicate,
  duplicateDisabled,
  onRemove,
  removeConfirmMessage,
  collapsed,
  onToggleCollapse,
}: {
  name: string;
  onNameChange: (v: string) => void;
  onNameBlur?: () => void;
  namePlaceholder: string;
  type: ItemType;
  onTypeChange?: (t: ItemType) => void;
  readOnly?: boolean;
  invalid?: boolean;
  flash?: boolean;
  disabled?: boolean;
  ariaLabel?: string;
  comentarioPath: string;
  comentarioValue: string;
  onComentarioChange: (path: string, value: string) => void;
  comentarioDisabled?: boolean;
  comentarioPlaceholder?: string;
  /** Valor padrão do item. Renderiza linha "VALOR:" interna se `onItemValueChange`
   *  passada e tipo for primitivo (não-object). */
  itemValue?: unknown;
  onItemValueChange?: (v: unknown) => void;
  /** Quando false, esconde linhas VALOR e NOTA (recolhido). Default true. */
  expanded?: boolean;
  /** Ações inline à direita da row 1 (mover + remover). */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
  onDuplicate?: () => void;
  duplicateDisabled?: boolean;
  onRemove?: () => void;
  removeConfirmMessage?: string;
  /** Chevron de recolher dentro da seção de ações. Só faz sentido pra
   *  containers (grupo + item objeto). Primitive items omitem. */
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const isExpanded = expanded !== false;
  const showValueRow =
    isExpanded && onItemValueChange !== undefined && type !== "object";
  const showNotaRow = isExpanded;
  const hasActions =
    onMoveUp !== undefined ||
    onMoveDown !== undefined ||
    onDuplicate !== undefined ||
    onRemove !== undefined;
  const showCollapseLeft = onToggleCollapse !== undefined;
  const borderColor = flash
    ? "var(--amber-border)"
    : invalid
      ? "var(--rose-border)"
      : "var(--b-soft)";
  const borderWidth = flash || invalid ? "1.5px" : "1px";
  return (
    <div
      className="rounded-md overflow-hidden"
      style={{
        border: `${borderWidth} solid ${borderColor}`,
        backgroundColor: "var(--ink-3)",
      }}
    >
      <div className="flex items-stretch">
        {showCollapseLeft && (
          <div
            className="flex items-center shrink-0"
            style={{
              background: "var(--ink-2)",
              borderRight: "1px solid var(--b-soft)",
              padding: "0 4px",
            }}
          >
            <button
              type="button"
              onClick={onToggleCollapse}
              disabled={disabled}
              aria-label={collapsed ? "Expandir" : "Recolher"}
              aria-expanded={!collapsed}
              title={
                collapsed
                  ? "Expandir tudo dentro deste objeto"
                  : "Recolher tudo dentro deste objeto"
              }
              className="inline-flex items-center justify-center disabled:opacity-30"
              style={{
                width: "26px",
                height: "26px",
                background: "transparent",
                border: "none",
                color: "var(--mint-300)",
                cursor: "pointer",
                lineHeight: 0,
                transition: "transform 0.18s ease",
                transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        )}
        <div className="flex-1 flex items-center min-w-0">
          <input
            type="text"
            value={name}
            onChange={(e) => onNameChange(e.target.value)}
            onBlur={onNameBlur}
            placeholder={namePlaceholder}
            disabled={disabled}
            aria-invalid={invalid}
            aria-label={ariaLabel}
            title="Use snake_case: minúsculas ASCII, dígitos e _"
            className="px-3 py-1.5 text-[13px] min-w-0"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--fg)",
              flex:
                !isExpanded && comentarioValue.trim() !== ""
                  ? "0 1 auto"
                  : "1 1 0",
              width:
                !isExpanded && comentarioValue.trim() !== ""
                  ? "auto"
                  : "100%",
            }}
          />
          {!isExpanded && comentarioValue.trim() !== "" && (
            <div
              className="flex-1 min-w-0 px-2 overflow-hidden whitespace-nowrap text-right"
              style={{
                fontSize: "10.5px",
                fontStyle: "italic",
                color: "var(--fg-subtle)",
                textOverflow: "ellipsis",
              }}
              title={comentarioValue}
            >
              // {comentarioValue}
            </div>
          )}
        </div>
        <div
          className="flex items-center shrink-0"
          style={{
            padding: "0 10px",
            background: "var(--ink-2)",
            borderLeft: "1px solid var(--b-soft)",
          }}
        >
          {readOnly || !onTypeChange ? (
            <span
              className="text-[11px]"
              style={{ color: "var(--fg-subtle)" }}
            >
              {TYPE_LABELS[type]}
            </span>
          ) : (
            <select
              value={type}
              onChange={(e) => onTypeChange(e.target.value as ItemType)}
              disabled={disabled}
              aria-label="Tipo"
              className="text-[11px]"
              style={{
                background: "transparent",
                border: "none",
                outline: "none",
                color: "var(--fg-muted)",
                cursor: "pointer",
                appearance: "none",
                WebkitAppearance: "none",
                MozAppearance: "none",
                paddingRight: "16px",
                backgroundImage: CHEVRON_DOWN_SVG,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 0 center",
                backgroundSize: "8px",
              }}
            >
              <option value="string">string</option>
              <option value="number">number</option>
              <option value="boolean">boolean</option>
              <option value="array">array</option>
              <option value="object">objeto</option>
            </select>
          )}
        </div>
        {hasActions && (
          <div
            className="flex items-stretch shrink-0"
            style={{
              background: "var(--ink-2)",
              borderLeft: "1px solid var(--b-soft)",
            }}
          >
            {onMoveUp !== undefined && (
              <button
                type="button"
                onClick={onMoveUp}
                disabled={disabled || upDisabled}
                aria-label="Mover pra cima"
                title="Mover pra cima"
                className="inline-flex items-center justify-center disabled:opacity-25"
                style={{
                  width: "26px",
                  background: "transparent",
                  border: "none",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: 1,
                }}
              >
                ↑
              </button>
            )}
            {onMoveDown !== undefined && (
              <button
                type="button"
                onClick={onMoveDown}
                disabled={disabled || downDisabled}
                aria-label="Mover pra baixo"
                title="Mover pra baixo"
                className="inline-flex items-center justify-center disabled:opacity-25"
                style={{
                  width: "26px",
                  background: "transparent",
                  border: "none",
                  borderLeft: "1px solid var(--b-soft)",
                  color: "var(--fg-muted)",
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: 1,
                }}
              >
                ↓
              </button>
            )}
            {onDuplicate !== undefined && (
              <button
                type="button"
                onClick={onDuplicate}
                disabled={disabled || duplicateDisabled}
                aria-label="Duplicar"
                title="Duplicar (clona item + sub-itens + comentários)"
                className="inline-flex items-center justify-center disabled:opacity-30"
                style={{
                  width: "34px",
                  background: "transparent",
                  border: "none",
                  borderLeft: "1px solid var(--b-soft)",
                  color: "var(--mint-300)",
                  cursor: "pointer",
                  padding: 0,
                  gap: "2px",
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span
                  className="text-[9.5px] uppercase"
                  style={{ letterSpacing: "0.02em", lineHeight: 1 }}
                  aria-hidden
                >
                  +1
                </span>
              </button>
            )}
            {onRemove !== undefined && (
              <button
                type="button"
                onClick={() => {
                  if (
                    removeConfirmMessage &&
                    !confirm(removeConfirmMessage)
                  )
                    return;
                  onRemove();
                }}
                disabled={disabled}
                aria-label="Remover"
                title="Remover"
                className="inline-flex items-center justify-center disabled:opacity-30"
                style={{
                  width: "26px",
                  background: "transparent",
                  border: "none",
                  borderLeft: "1px solid var(--b-soft)",
                  color: "var(--rose-300)",
                  cursor: "pointer",
                  fontSize: "12px",
                  lineHeight: 1,
                }}
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
      {showValueRow && (
        <div
          className="flex items-center gap-2 py-1.5"
          style={{
            borderTop: "1px solid var(--b-soft)",
            paddingLeft: "28px",
            paddingRight: "12px",
          }}
        >
          <span
            className="uppercase shrink-0 select-none"
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              color: "var(--fg-subtle)",
            }}
          >
            valor:
          </span>
          <div className="flex-1 min-w-0">
            <TemplateValueInputCompact
              type={type}
              value={itemValue}
              onChange={onItemValueChange!}
              disabled={disabled}
            />
          </div>
        </div>
      )}
      {showNotaRow && (
        <div
          className="flex items-center gap-2 py-1.5"
          style={{
            borderTop: "1px solid var(--b-soft)",
            paddingLeft: "28px",
            paddingRight: "12px",
          }}
        >
          <span
            className="uppercase shrink-0 select-none"
            style={{
              fontSize: "10px",
              letterSpacing: "0.08em",
              color: "var(--mint-300)",
            }}
          >
            nota:
          </span>
          <input
            type="text"
            value={comentarioValue}
            onChange={(e) =>
              onComentarioChange(comentarioPath, e.target.value)
            }
            disabled={comentarioDisabled}
            maxLength={MAX_COMENTARIO_LEN}
            placeholder={
              comentarioPlaceholder ?? "documente o que esse campo significa"
            }
            className="flex-1 text-[12px]"
            style={{
              background: "transparent",
              border: "none",
              outline: "none",
              color: "var(--fg-muted)",
              fontStyle: "italic",
              minWidth: 0,
            }}
          />
        </div>
      )}
    </div>
  );
}

/** Renderer compacto pra valor padrão. Sem label próprio (NameTypeCell já
 *  fornece o "VALOR:" do lado de fora). Sem borda — usa transparente
 *  pra parecer parte da célula. */
function TemplateValueInputCompact({
  type,
  value,
  onChange,
  disabled,
}: {
  type: ItemType;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  const baseInputStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    outline: "none",
    color: "var(--fg)",
    width: "100%",
    fontSize: "12.5px",
    padding: "0",
  };

  if (type === "string") {
    const s = typeof value === "string" ? value : "";
    return (
      <input
        type="text"
        value={s}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="texto padrão (opcional)"
        style={baseInputStyle}
      />
    );
  }

  if (type === "number") {
    const n = typeof value === "number" && !Number.isNaN(value) ? value : 0;
    return (
      <input
        type="number"
        value={n === 0 ? "" : String(n)}
        onChange={(e) => {
          const v = e.target.value;
          onChange(v === "" ? 0 : Number(v));
        }}
        disabled={disabled}
        placeholder="0"
        style={baseInputStyle}
      />
    );
  }

  if (type === "boolean") {
    const b = typeof value === "boolean" ? value : false;
    return (
      <button
        type="button"
        onClick={() => onChange(!b)}
        disabled={disabled}
        className="text-[11px] px-2 py-0.5 rounded-md"
        style={{
          backgroundColor: b ? "var(--mint-300)" : "var(--ink-2)",
          color: b ? "var(--ink-1)" : "var(--fg-muted)",
          border: `1px solid ${b ? "var(--mint-300)" : "var(--b-soft)"}`,
        }}
      >
        {b ? "true" : "false"}
      </button>
    );
  }

  if (type === "array") {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    const text = arr.map((v) => String(v)).join(", ");
    return (
      <input
        type="text"
        value={text}
        onChange={(e) => {
          const lines = e.target.value
            .split(",")
            .map((s) => s.trim())
            .filter((s) => s !== "");
          onChange(lines);
        }}
        disabled={disabled}
        placeholder="item_a, item_b, item_c"
        style={{
          ...baseInputStyle,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
        }}
      />
    );
  }

  return null;
}

function ChevronToggle({
  collapsed,
  onClick,
}: {
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={collapsed ? "Expandir" : "Recolher"}
      aria-expanded={!collapsed}
      title={collapsed ? "Clique pra expandir" : "Clique pra recolher"}
      className="inline-flex items-center justify-center rounded-md shrink-0"
      style={{
        width: "28px",
        height: "28px",
        backgroundColor: "var(--ink-3)",
        color: "var(--mint-300)",
        border: "1px solid var(--b-soft)",
        cursor: "pointer",
        fontSize: "15px",
        lineHeight: 1,
        transition: "transform 0.15s ease, background-color 0.15s ease",
        transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
      }}
    >
      ▾
    </button>
  );
}

function MoveButtons({
  onUp,
  onDown,
  upDisabled,
  downDisabled,
}: {
  onUp: () => void;
  onDown: () => void;
  upDisabled?: boolean;
  downDisabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={onUp}
        disabled={upDisabled}
        aria-label="Mover pra cima"
        title="Mover pra cima"
        className="text-[12px] px-1.5 py-1 rounded-md disabled:opacity-30"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
        }}
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={downDisabled}
        aria-label="Mover pra baixo"
        title="Mover pra baixo"
        className="text-[12px] px-1.5 py-1 rounded-md disabled:opacity-30"
        style={{
          backgroundColor: "var(--ink-3)",
          color: "var(--fg-muted)",
          border: "1px solid var(--b-soft)",
        }}
      >
        ↓
      </button>
    </span>
  );
}

/** Editor de valor padrão por tipo. Não usa `FieldInput.tsx` (do form de
 *  instância) pra evitar comportamentos de auto-fill/secret que fazem
 *  sentido só na edição do cliente, não no template. */
function TemplateValueInput({
  type,
  value,
  onChange,
  disabled,
}: {
  type: ItemType;
  value: unknown;
  onChange: (next: unknown) => void;
  disabled?: boolean;
}) {
  const labelStyle: React.CSSProperties = {
    fontSize: "10px",
    color: "var(--fg-subtle)",
    letterSpacing: "0.04em",
  };

  if (type === "string") {
    const s = typeof value === "string" ? value : "";
    return (
      <label className="flex flex-col gap-1">
        <span style={labelStyle} className="uppercase">
          valor padrão (opcional)
        </span>
        <input
          type="text"
          value={s}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="texto padrão pra preencher o campo na instância"
          className="input-edit"
        />
      </label>
    );
  }

  if (type === "number") {
    const n = typeof value === "number" && !Number.isNaN(value) ? value : 0;
    return (
      <label className="flex flex-col gap-1">
        <span style={labelStyle} className="uppercase">
          valor padrão (opcional)
        </span>
        <input
          type="number"
          value={n === 0 ? "" : String(n)}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v === "" ? 0 : Number(v));
          }}
          disabled={disabled}
          placeholder="0"
          className="input-edit"
        />
      </label>
    );
  }

  if (type === "boolean") {
    const b = typeof value === "boolean" ? value : false;
    return (
      <div className="flex items-center gap-2">
        <span style={labelStyle} className="uppercase">
          valor padrão
        </span>
        <button
          type="button"
          onClick={() => onChange(!b)}
          disabled={disabled}
          className="text-[11px] px-2 py-1 rounded-md"
          style={{
            backgroundColor: b ? "var(--mint-300)" : "var(--ink-3)",
            color: b ? "var(--ink-1)" : "var(--fg-muted)",
            border: `1px solid ${b ? "var(--mint-300)" : "var(--b-soft)"}`,
          }}
        >
          {b ? "true" : "false"}
        </button>
      </div>
    );
  }

  if (type === "array") {
    const arr = Array.isArray(value) ? (value as unknown[]) : [];
    const text = arr.map((v) => String(v)).join("\n");
    return (
      <label className="flex flex-col gap-1">
        <span style={labelStyle} className="uppercase">
          valor padrão · um item por linha (opcional)
        </span>
        <textarea
          value={text}
          onChange={(e) => {
            const lines = e.target.value
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s !== "");
            onChange(lines);
          }}
          disabled={disabled}
          rows={3}
          spellCheck={false}
          placeholder={"item_a\nitem_b\nitem_c"}
          className="input-edit"
          style={{
            resize: "vertical",
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: "12px",
            lineHeight: "1.5",
          }}
        />
      </label>
    );
  }

  return null;
}

function ComentarioInput({
  path,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  path: string;
  value: string;
  onChange: (path: string, value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div
      className="flex items-stretch rounded-md overflow-hidden"
      style={{
        backgroundColor: "var(--ink-3)",
        border: "1px solid var(--b-soft)",
      }}
    >
      <span
        aria-hidden
        className="text-[10px] uppercase tracking-wider px-2 inline-flex items-center select-none"
        style={{
          backgroundColor: "var(--ink-2)",
          color: "var(--mint-300)",
          borderRight: "1px solid var(--b-soft)",
          letterSpacing: "0.06em",
        }}
      >
        nota
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(path, e.target.value)}
        disabled={disabled}
        maxLength={MAX_COMENTARIO_LEN}
        placeholder={placeholder ?? "documente o que esse campo significa"}
        className="flex-1 text-[12px] px-2 py-1"
        style={{
          backgroundColor: "transparent",
          color: "var(--fg-muted)",
          fontStyle: "italic",
          border: "none",
          outline: "none",
        }}
      />
    </div>
  );
}

# Tabelas editoriais — Groner Flows

Documento canônico das convenções de tabelas em `apps/web`. Toda nova tabela deve seguir este padrão. Tabelas existentes que divergem devem ser ajustadas.

## Conceito

Uma "tabela editorial" é uma tabela densa, single-line, com edit inline célula-a-célula, filtros, paginação e modal de edição completo. Inspiração: planilha + form. Não é uma data-grid genérica — é específica para o domínio Groner (tenants, clientes, leads, agendamentos, etc.).

Características intrínsecas:
- Linhas **nunca quebram**. Conteúdo respeita `maxWidth: 25ch` + ellipsis em wrapper interno.
- Header **sticky** via classe `.table-editorial` (definida em `globals.css`).
- Paginação client-side, default `pageSize=10`.
- Persistência de UI por rota em `localStorage` (chave `groner.<rota>.<feature>_v1`).
- Edit inline via ícone ✎ (hover) ou Enter (com seleção via setas).
- Modal de edição completo via double-click.

## Tabelas existentes

| Rota | Arquivo | Editável | Modal "Novo" | Validação JSON |
|---|---|---|---|---|
| `/clientes` | `clientes/clientes-table.tsx` | sim | sim | sim |
| `/lojas` | `lojas/lojas-table.tsx` | sim | sim | sim |
| `/usuarios` | `usuarios/usuarios-table.tsx` | sim | sim | sim |
| `/agentes` | `agentes/agentes-table.tsx` | sim | sim | sim |
| `/automacoes` | `automacoes/automacoes-table.tsx` | super/cliente admin; vendedor read-only | sim | sim |
| `/leads` | `leads/leads-table.tsx` | vendedor (kind=usuario): follow-up dos próprios; super: tudo; cliente admin: NÃO (read-only — passa pelo CRM) | não (vem do CRM) | sim |
| `/agendamentos` | `agendamentos/agendamentos-table.tsx` | vendedor (próprios via lead.vendedorId): data/status/obs; super: tudo; cliente admin: NÃO (read-only — fala com vendedor ou ajusta no CRM) | não (criado pela IA) | não (sem jsonb) |

## Reuso em drilldown (`embedded`)

Várias tabelas são reaproveitadas como sub-aba do drilldown de cliente
(`/clientes/[id]/<rota>`). A convenção é receber uma prop opcional
`embedded?: boolean` (default `false`):

- Quando `embedded`, a tabela é renderizada dentro do `<section>` do layout
  do drilldown — então toolbar redundante deve ser escondida (em especial o
  botão `+ Novo X`, já que o drilldown não tem header próprio para essa CTA
  e a criação geralmente já é feita pela tela raiz).
- Filtros, busca, ColumnPicker, Saúde, Validação JSON e edit inline
  permanecem ativos.
- Server component da sub-rota carrega rows via helper dedicado em
  `clientes/[id]/_data.ts` (com gate de tenant via `loadClienteOrForbid`).

Tabelas que suportam `embedded` hoje: clientes (n/a — é a raiz), lojas,
usuarios (vendedores), leads, agendamentos, agentes, automacoes.

## Features obrigatórias

Todas as tabelas DEVEM ter (na ausência de motivo documentado):

### Layout / Toolbar (ordem da esquerda pra direita)

1. **`<SearchBox compact placeholder="Buscar por ..." />`** — server-side, lê/escreve query param `q`. Importado de `@/components/search-box`.
2. **Filtro client-side por nome** (super-only) — input. Placeholder: `"Filtrar por nome..."`. Aparece apenas se `isSuper`.
3. **Botão Agrupar por X** (super-only quando aplicável) — toggle. X depende do contexto: cliente (lojas/agentes/leads/agendamentos), loja (usuarios). Header de grupo mostra `▸/▾`, nome, contador. Border-left mint sutil (`2px solid rgba(70,200,154,0.55)`) marca rows do grupo.
4. **`<ColumnPicker>`** — sempre visível. Importado de `@/components/data-table`.
5. **Toggle "Ações"** (super-only) — mostra/esconde colunas de ação super-only (validação JSON, fetch CRM, etc). Aparece só se `ACTION_COL_KEYS.length > 0`.
6. **Botão "+ Novo X"** — só em tabelas onde criação é permitida no app. Read-only de CRM externo (leads, agendamentos) NÃO tem botão.

### Header

- Cada `<th>` é clicável (cursor pointer, hover mint). Sort cycle: `null → asc → desc → asc`. Indicador `↑`/`↓` em mint.
- Drag-reorder de colunas: **NÃO faz parte do padrão atual** (clientes/lojas têm — em revisão para remoção).

### Body / Células

- Wrapper interno com `maxWidth: 25ch; overflow: hidden; textOverflow: ellipsis; whiteSpace: nowrap`.
- `title` no wrapper com valor completo pra hover-tooltip nativo.
- Célula faltante: `<IconInfo size={12}>` âmbar (`rgb(220, 180, 80)`) ao lado do valor `—`.
- Hover na célula revela botão ✎ (`opacity: 0 → 100 group-hover/cell:opacity-100`).
- Click na célula seleciona (highlight). Setas movem. Enter abre edit. Escape limpa.
- Double-click em qualquer célula da linha abre modal de edição.

### Edit inline

- Componente: `CellEditor` (a extrair pra `@/components/data-table/cell-editor.tsx`).
- Variantes por `editKind`:
  - `"text"` — `<textarea rows={1}>`, `width = min(80ch, max(8, text.length+2)ch)`, auto-grow vertical via `scrollHeight`. Enter salva, Shift+Enter quebra linha, Escape cancela.
  - `"numeric"` — `<input type="number" step="any">`. Enter/Escape idem.
  - `"datetime"` — `<input type="datetime-local">`. Salva como ISO.
  - `"vendedor"` (ou outros pickers) — `<SearchableSelect>`. Onchange dispara commit imediato.
- Borda mint em foco. `boxShadow: 0 4px 12px rgba(0,0,0,0.35)`.

### Coluna Saúde

- `key: "saude"`, `align: "center"`, `readOnly: true`.
- Badge com pill verde mint (`ok`) ou vermelho (`N pendente(s)`).
- Click no badge abre modal de edição com a aba relevante.
- Helpers em `saude-<rota>.ts`: `pendenciasFor(row): Pendencia[]`.

### Coluna Validação JSON (super-only)

- `key: "validacao"`, `align: "center"`, `readOnly: true`, `superOnly: true`.
- Aparece em `ACTION_COL_KEYS` (escondida por toggle "Ações").
- Click abre `<JsonValidationModal>` com fields construídos por `buildXValidation(row)` em `saude-<rota>.ts`.
- **Exceção**: omitir quando não há jsonb relevante (ex: `agendamentos`).

### Coluna Ações (drilldown only)

- `key: "acoes"`, `align: "right"`, `readOnly: true`, `sortable: false`.
- **Posição**: sempre última coluna, fixa à direita (não reordenável via drag).
- **Não** aparece no `<ColumnPicker>` (não ocultável).
- Conteúdo: `<AcessarButton href={drilldownPath}>` — `<Link>` com texto "Acessar →".
- Renderiza apenas se a tabela tem rota drilldown dedicada (clientes, lojas, usuarios). Não aplicável a tabelas que abrem modal (agentes, leads, agendamentos).
- Esconder quando `embedded === true` (já dentro do drilldown).
- `aria-label` contextualizado por row.
- Enter via teclado na célula selecionada dispara navegação.
- Double-click na row continua disponível como atalho redundante.
- `prefetch={false}` por default no `AcessarButton` — evita warm-up de N rotas em scroll/paginação. Pode ser sobrescrito via prop `prefetch={true}` quando a tabela tem poucas rows.

### Paginação

- `<TablePagination>` no rodapé. `pageSize` persistido em `groner.<rota>.page_size_v1`. Default 10.

### Navegação por setas (obrigatória)

- State `selected: { r: number; c: number } | null`.
- `↑↓←→` move célula (clamp em pagedRows.length × orderedDefs.length).
- `Enter` abre edit inline se célula `editable && !readOnly`.
- `Escape` limpa seleção.
- Click em td também seleciona.
- Listener global de keydown ignora target `INPUT/TEXTAREA/contentEditable` pra não interceptar digitação.
- Visual: `outline: 1px solid var(--mint-300)` + `outlineOffset: -1px` + `backgroundColor: rgba(70,200,154,0.05)`.

## Estrutura de arquivos esperada

Por rota `/<X>`:

```
apps/web/src/app/(app)/<X>/
├── page.tsx                  # server component, fetch + auth, monta props
├── <X>-table.tsx             # client component principal
├── <X>-edit-modal.tsx        # modal com 2+ abas (TabButton)
├── <X>-novo-modal.tsx        # opcional, só onde criação é permitida
├── actions.ts                # server actions (update<X>Cell, update<X>Fields, create<X>, ...)
└── saude-<X>.ts              # tipo Row, pendenciasFor, build<X>Validation
```

## Convenções de naming

### Storage keys

- `groner.<rota>.col_hidden_v1` — `JSON.stringify(ColKey[])` das colunas escondidas.
- `groner.<rota>.page_size_v1` — `String(pageSize)` (10 | 20 | 50 | 100).
- `groner.<rota>.col_order_v1` — DEPRECATED (drag-reorder em revisão).

### Tipos

- Sempre exportar `type ColKey = "..." | "..." | ...` no topo do `<X>-table.tsx`.
- `type ColDef = { key, label, align?, superOnly?, readOnly?, editKind? }`.
- `const COLUMNS: ColDef[]` — fonte única de verdade da estrutura.
- `const DEFAULT_VISIBLE: ReadonlySet<ColKey>` — quais colunas começam visíveis no primeiro acesso.

### Tipos compartilhados

- `PageSize`, `PAGE_SIZE_OPTIONS` em `@/components/data-table` (table-pagination.tsx).
- `PickerColDef<K>` em `@/components/data-table` (column-picker.tsx).
- `ValidationField` em `@/components/data-table` (json-validation-modal.tsx).

## Permissões

Quatro roles relevantes:

| Role | UI | Pode editar | Vê coluna `tenant`/Cliente | Vê colunas super-only |
|---|---|---|---|---|
| `super` | tudo | sim | sim | sim |
| `owner` (admin do cliente) | sem tenant cross-row | sim, exceto leads/agendamentos (read-only) | não (implícito) | não |
| `vendedor` | sem tenant | restrito (apenas próprios leads/follow-up) | não | não |
| outros | leitura | não | não | não |

> Tabelas com automações (`leads`, `agendamentos`) são read-only pra cliente
> admin (`owner`). Edição local criaria drift contra webhook do CRM (leads)
> e fluxo da IA (agendamentos). Reatribuição de vendedor, alteração de
> status, follow-up e reagendamento passam pelo CRM ou pelo vendedor
> responsável. Defesa em profundidade: `loadAndAuthorize` em
> `leads/actions.ts` e `agendamentos/actions.ts` rejeita payload de cliente
> admin via `isClienteAdminReadOnly()` (`@/lib/auth/guard`). UI exibe
> subtitle no `<h1>` da rota raiz e banner discreto acima da toolbar
> (drilldowns embedded). Ver `readOnlyReason="cliente-admin"` em
> `<LeadsTable>` / `<AgendamentosTable>`.

Convenção: o componente recebe props `isSuper: boolean`, `canEdit: boolean`, `isVendedor: boolean` do server component. Em tabelas com automações, recebe também `readOnlyReason?: "cliente-admin" | null`.

## Performance

- Paginação **client-side** (server retorna lista completa filtrada por tenant + busca). Page size default 10.
- `useMemo` para `sortedRows`, `filteredRows`, `pagedRows`, `grouped`, `orderedDefs`.
- Não usar virtualização ainda — listas raramente >500 rows por tenant.
- `router.refresh()` após save inline (revalida server component).

## Acessibilidade

- Tabela sticky-header. `<th>` com texto legível (mín. 12.5px).
- Setas direcionais movem seleção entre células visíveis.
- Enter abre edit (apenas se célula `!readOnly`). Escape sai.
- Listener global de keydown ignora target em `INPUT`/`TEXTAREA`/`isContentEditable` pra não interceptar digitação.
- Todos os botões têm `aria-label` ou `title`.
- IconInfo âmbar em campo faltante tem `aria-label="Informação faltando"`.

## Boilerplate mínimo (pseudocódigo)

```tsx
// <X>-table.tsx
"use client";
import { /* hooks, SearchBox, data-table primitives */ } from "...";
import { update<X>Cell } from "./actions";
import { <X>EditModal } from "./<X>-edit-modal";
import { pendenciasFor, build<X>Validation, type <X>Row } from "./saude-<X>";

type ColKey = "..." | "saude" | "validacao";
type ColDef = { key: ColKey; label: string; align?: ...; superOnly?: ...; readOnly?: ...; editKind?: ... };
const COLUMNS: ColDef[] = [ /* ... + saude + validacao */ ];
const STORAGE_HIDDEN = "groner.<x>.col_hidden_v1";
const STORAGE_PAGE_SIZE = "groner.<x>.page_size_v1";
const ACTION_COL_KEYS: ColKey[] = ["validacao", /* ... */];
const DEFAULT_VISIBLE: ReadonlySet<ColKey> = new Set([...]);

export function <X>Table({ rows, isSuper, canEdit, isVendedor }: Props) {
  // 1. visibleDefs (filtra superOnly)
  // 2. hidden + persistHidden (localStorage STORAGE_HIDDEN)
  // 3. sortKey/sortDir + toggleSort (default: createdAt desc ou nome asc)
  // 4. filtro super + filteredRows
  // 5. groupByCliente super + collapsed Set + grouped derivado
  // 6. pageSize + pageIndex + persistPageSize (localStorage STORAGE_PAGE_SIZE)
  // 7. pagedRows
  // 8. selected {r,c} + moveSelection + listener global de keydown (setas/Enter/Escape)
  // 9. editing {rowId, key} + startEdit/cancelEdit/commitEdit (via update<X>Cell)
  // 10. editTarget + validacaoTarget (modais)
  // 11. orderedDefs = visibleDefs.filter(d => !hidden.has(d.key))
  // 12. renderRow(r, rIdx, opts?) — onClick(setSelected) + onDoubleClick(setEditTarget)
  // 13. JSX: toolbar + table + footer + paginação + modais
}
```

## Testes mentais (smoke por persona)

Antes de commitar uma tabela nova/refatorada, executar mentalmente:

- [ ] **super logado**: vê coluna `tenant`/Cliente; Filtrar por nome funciona; Agrupar por X colapsa/expande; Validação JSON visível e abre modal; Toggle Ações esconde validação; "+ Novo X" abre modal de criação.
- [ ] **owner do cliente**: NÃO vê coluna tenant; NÃO vê filtro por nome; NÃO vê botão Agrupar; NÃO vê coluna Validação JSON; vê "+ Novo X". **Em leads/agendamentos**: NÃO consegue editar inline (sem ✎ em nenhuma célula); modal abre em read-only sem botão Salvar; subtitle abaixo do `<h1>` e banner acima da toolbar explicam por quê; payload forjado via DevTools é rejeitado por `loadAndAuthorize` no servidor. **Em demais tabelas (clientes, lojas, usuarios, agentes)**: edita normalmente inline e via modal.
- [ ] **vendedor**: vê apenas próprios registros; só edita campos permitidos (ex: leads → step/status/proximo follow-up; demais campos sem ✎).
- [ ] **Navegação por teclado**: setas movem; Enter abre edit em célula editável; Enter não abre em readOnly; Escape limpa seleção; quando estou editando, setas digitam normal (não navegam).
- [ ] **Edit inline texto**: cresce horizontalmente até 80ch, depois quebra. Enter salva. Shift+Enter quebra linha visual.
- [ ] **Edit inline numeric**: Enter salva. Vírgula vira ponto. Vazio = null.
- [ ] **Edit inline datetime**: Enter salva ISO. Vazio = null.
- [ ] **Saúde**: badge verde quando 0 pendências; vermelho com contagem caso contrário; click abre modal.
- [ ] **Validação JSON** (super): badge verde se sem warns; vermelho com contagem; modal lista campos com status `ok`/`warn`/`missing`.
- [ ] **Persistência**: reload preserva colunas escondidas e page size por rota.
- [ ] **Paginação**: filtro reseta para página 0; trocar pageSize reseta para 0.
- [ ] **Modal**: double-click em qualquer célula abre. Tab cycle funciona. Esc fecha.

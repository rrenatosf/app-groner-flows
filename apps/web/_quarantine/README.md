# Quarentena de arquivos órfãos

**Pasta criada em: 2026-05-08**

Este diretório guarda arquivos que **não são mais usados** pelo sistema mas
foram preservados em vez de deletados. A ideia é segurança: caso descubramos
algum efeito colateral inesperado nos próximos dias, podemos restaurar
rapidamente.

## Política de remoção

Os arquivos aqui dentro **devem ser deletados** após **30 dias corridos
sem uso** sem que nenhum problema relacionado tenha aparecido em logs,
relatos do usuário ou builds.

**Data limite para deleção definitiva: 2026-06-07**

Antes de deletar, conferir:

1. `grep -r "perfil/cliente" apps/web/src` — deve retornar zero referências.
2. `npm run dev` + smoke test em `/clientes`, `/lojas`, `/usuarios`,
   `/agentes` — todas as features funcionando.
3. Status no banco: `clientes`, `clientes.lojas[]`, `clientes.vendedores[]`,
   `agentes` — operações de leitura/escrita ok.

Se passar nos 3 checks após 2026-06-07, executar:

```bash
rm -rf apps/web/_quarantine
```

E remover a entrada `_quarantine` de `apps/web/tsconfig.json` exclude.

## O que está aqui e por quê

Arquivos movidos em **2026-05-08** durante a consolidação de telas no
padrão clientes/lojas/usuários. As funções que outras telas ainda
precisam (fetch CRM, instâncias WhatsApp, slots de funil) foram movidas
pra locais neutros e continuam ativas:

- `src/server/actions/cliente-crm.ts` — server actions de fetch CRM.
- `src/server/actions/cliente-lojas.ts` — server actions legacy de lojas.
- `src/components/crm/crm-status-slots.tsx` — componente de configuração
  de slots do funil CRM (usado na aba "Colunas do CRM" do modal de cliente).

### `perfil-cliente/`

Telas e modais da rota `/perfil/cliente` (legacy "Cadastro global").
Substituídas por `/clientes` + modal de edição com aba "Colunas do CRM".

- `page.tsx` — server page da rota.
- `cliente-create-modal.tsx` — modal grande de criação (~2700 linhas).
- `cliente-edit-modal.tsx` — modal grande de edição.
- `clientes-table.tsx` — tabela legacy.

### `perfil-cliente-lojas/`

Section legacy de lojas dentro de `/perfil/cliente`.

- `lojas-section.tsx` — UI antiga de listar/editar lojas inline.

### `usuarios-novo-route/`

Rota `/usuarios/novo` (página antiga de cadastro). Substituída pelo modal
`UsuarioNovoModal` em `/usuarios`.

- `page.tsx`, `form.tsx`, `actions.ts`.

### `usuarios-id-editar-route/`

Rota `/usuarios/[id]/editar` (página antiga de edição). Substituída pelo
modal `UsuarioEditModal` em `/usuarios` (com aba Horários integrada).

- `page.tsx`, `horarios-grid.tsx`, `actions.ts`.

### Arquivos soltos em `/usuarios` (legacy)

Componentes auxiliares que existiam só pra suportar a página antiga.

- `usuarios-inline-cells.tsx` — cells inline da tabela antiga.
- `usuarios-agenda-cell.tsx` — célula de status de agenda.
- `usuarios-agenda-actions.ts` — actions da célula de agenda.
- `usuarios-tenant-filter.tsx` — filtro por tenant da tabela antiga.
- `usuarios-crm-picker.tsx` — picker de usuários do CRM (substituído pelo
  modal "Buscar usuários da loja" em `/lojas`).

## Re-ativar um arquivo

Se for necessário restaurar:

1. Mover o arquivo de volta pra origem (`apps/web/src/app/(app)/...`).
2. Atualizar imports — alguns paths mudaram (ex: `@/server/actions/cliente-crm`
   em vez de `./actions`).
3. Adicionar entry de volta no `sidebar.tsx` se for página com link de menu.
4. Rodar `npm run dev` + `npx tsc --noEmit` pra validar.

## tsconfig

Pasta `_quarantine` está em `tsconfig.json` → `exclude`, então o
TypeScript não compila esses arquivos. Não dá warning de import
quebrado, não bloqueia build, mas também não evita que o usuário
acesse rotas ativas.

## Histórico

- **2026-05-08**: arquivos movidos durante consolidação clientes/lojas/usuários.
  Recriação de `/clientes`, `/lojas`, `/usuarios`, `/agentes` no padrão
  editorial unificado tornou estes arquivos órfãos.

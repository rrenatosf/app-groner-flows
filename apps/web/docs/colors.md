# Paleta Bling — Guia de Cores

Codificação visual do app, alinhada à paleta neutra-fria do Bling com mint Groner como cor de identidade.

## Regra de ouro

Mint é cor de **TINTA** (texto, ícone, dot de status, faixa 2px de acento, focus ring).
Mint **NÃO** é cor de **TINTA-DE-FUNDO** de container.

Containers (cards, painéis, modais, banners) usam tokens neutros:

- `var(--ink-1)` — body / canvas
- `var(--ink-2)` — sidebar / surfaces principais
- `var(--ink-3)` — cards / sub-painéis
- `var(--ink-4)` — hover / active surface
- `var(--ink-5)` — elevated / ring base

## Tokens semânticos

### Neutros

| Token | Uso |
|---|---|
| `var(--ink-1)` | Background do body |
| `var(--ink-2)` | Sidebar, surface raised |
| `var(--ink-3)` | Card, info-block, success banner |
| `var(--ink-4)` | Hover row, selected surface, drag-over |
| `var(--ink-5)` | Elevated, ring base |
| `var(--fg)` | Texto primário |
| `var(--fg-muted)` | Texto secundário |
| `var(--fg-subtle)` | Texto terciário, label |
| `var(--fg-disabled)` | Texto desabilitado |
| `var(--b-soft)` | Borda muito sutil |
| `var(--b-base)` | Borda padrão |
| `var(--b-strong)` | Borda destacada (hover) |
| `var(--b-bright)` | Borda muito visível |

### Mint (brand)

| Token | Uso |
|---|---|
| `var(--mint-100)` | Texto sobre bg mint escuro |
| `var(--mint-200)` | Texto mint claro |
| `var(--mint-300)` | Texto/dot/ícone primário (links, accents) |
| `var(--mint-400)` | CTA primary background |
| `var(--mint-500)` | CTA hover |
| `var(--mint-600)` | Switch border ativo |
| `var(--mint-700)` | Switch fill ativo, gradient |

### Acentos de status

| Token | Uso |
|---|---|
| `var(--amber-300)` / `--amber-bg` / `--amber-border` | Warning, pending, banner amber |
| `var(--rose-300)` / `--rose-bg` / `--rose-border` | Erro, destrutivo, pendência |
| `var(--sky-300)` / `--sky-bg` / `--sky-border` | Info |
| `var(--violet-300)` / `--violet-bg` / `--violet-border` | Secundário |

## Os 7 padrões de drift A-H (atual vs correto)

| # | Drift | Correção |
|---|---|---|
| **A** | `bg: rgba(70,200,154, 0.05–0.10)` em container/card/painel | `bg: var(--ink-3)` (ou classe `.info-block` / `.surface-flat`) |
| **B** | `border: 1px solid rgba(70,200,154, 0.32–0.45)` borda genérica | `border: 1px solid var(--b-base)` (hover: `--b-strong`) |
| **C** | Selected/active state com bg mint pesado | `bg: var(--ink-4)` + `borderLeft 2px var(--mint-300)` (acento) |
| **D** | Drag-over com bg mint | `bg: rgba(255,255,255,0.025)` + `2px solid var(--mint-300)` linha-guia |
| **E** | Banner success com bg+border verdes | `var(--ink-3)` + check `var(--mint-300)` no texto, ou `chip-mint` inline |
| **F** | Status pill OK com `0 0 6px rgba(70,200,154,0.55)` glow | dot `var(--mint-300)` SEM glow |
| **G** | Erro `rgb(214,110,92)` raw | `var(--rose-300)` / `--rose-bg` / `--rose-border` |
| **H** | Warning `rgba(220,140,60,*)` raw | `var(--amber-300)` / `--amber-bg` / `--amber-border` |

## Classes canônicas (em `globals.css`)

### Surfaces

- `.surface` — card padrão (ink-2 + b-base + glow-sm)
- `.surface-flat` — card sem sombra (ink-2 + b-soft)
- `.surface-raised` — card elevado com sombra média
- `.info-block` — bloco neutro dentro de modal (ink-3 + b-base)
- `.kpi-card` — card de KPI com hover lift

### Buttons

- `.btn-primary` — CTA mint sólido (mint-400 + black text)
- `.btn-ghost` — botão secundário neutro

### Chips

- `.chip` — base neutra (ink-3 + b-base + fg-muted)
- `.chip-mint` — accent mint (border mint 0.32 + bg mint 0.08 + text mint-200)
- `.chip-amber` — warning (amber bg + border + text)
- `.chip-red` — erro (rose bg + border + text)

### Inputs

- `.input` / `.textarea` / `.select` — input padrão com focus mint

### Tables

- `.table-editorial` — tabela Bling-minimalista (sem zebra, hover sutil)

## Quando usar cada token

| Situação | Token |
|---|---|
| Bg de modal/card/painel | `var(--ink-2)` ou `var(--ink-3)` |
| Bg de hover de linha | `rgba(255,255,255,0.025)` ou `var(--ink-4)` |
| Bg de row selecionada | `var(--ink-4)` + `borderLeft: 2px solid var(--mint-300)` |
| Bg de banner success | `var(--ink-3)` (com check mint no texto) |
| Bg de banner warning | `var(--amber-bg)` |
| Bg de banner erro | `var(--rose-bg)` |
| Bg de CTA "Novo X" | `chip chip-mint` ou `.btn-primary` |
| Bg de botão "Salvar" | `chip chip-mint` |
| Bg de botão "Remover" | `chip chip-red` |
| Texto destaque mint | `var(--mint-300)` |
| Texto link sobre fundo claro | `var(--mint-200)` |
| Border focus de input | `var(--mint-400)` |
| Dot de status ativo | `var(--mint-300)` (sem glow) |
| Dot de erro | `var(--rose-300)` |
| Dot de warning | `var(--amber-300)` |

## O que NÃO fazer

```tsx
// ❌ ERRADO — bg mint em container
<div style={{ backgroundColor: "rgba(70,200,154,0.10)" }}>...</div>

// ✅ CORRETO — container neutro
<div style={{ backgroundColor: "var(--ink-3)" }}>...</div>

// ❌ ERRADO — border mint genérica
<div style={{ border: "1px solid rgba(70,200,154,0.32)" }}>...</div>

// ✅ CORRETO — border neutra
<div style={{ border: "1px solid var(--b-base)" }}>...</div>

// ❌ ERRADO — glow em dot de status
<span style={{ backgroundColor: "var(--mint-300)", boxShadow: "0 0 6px rgba(70,200,154,0.6)" }} />

// ✅ CORRETO — dot limpo
<span style={{ backgroundColor: "var(--mint-300)" }} />

// ❌ ERRADO — selected com bg verde pesado
<tr style={{ backgroundColor: "rgba(70,200,154,0.06)" }}>...</tr>

// ✅ CORRETO — selected com ink-4 + faixa mint
<tr style={{
  backgroundColor: "var(--ink-4)",
  boxShadow: "inset 2px 0 0 var(--mint-300)",
}}>...</tr>

// ❌ ERRADO — cores raw rose/amber
<div style={{ color: "rgb(214,110,92)", backgroundColor: "rgba(214,110,92,0.10)" }}>...</div>

// ✅ CORRETO — tokens semânticos
<div style={{ color: "var(--rose-300)", backgroundColor: "var(--rose-bg)" }}>...</div>
```

## Casos legítimos de mint accent

Mint pode aparecer como:

- **Texto** — link, label de campo importante, valor de KPI verde
- **Ícone** — check, dot de status, chevron de active
- **Dot/circle** — status indicator (sem glow!)
- **Faixa 2px** — borderLeft de linha selecionada, accent de tab ativa
- **Focus ring** — `--mint-400` na borda de input em foco
- **CTA** — `.btn-primary` ou `.chip chip-mint` (botões "Salvar", "Novo X", "Confirmar")
- **Switch ativo** — fill `--mint-700` + border `--mint-600` quando enabled
- **Gradient sutil** — splash do login (alpha 0.04 max), faixa de progresso

## Progresso (Bloco F)

- Drift inicial: 222 ocorrências `rgba(70,200,154,*)` em consumidores
- Drift final: ~12 (todas legítimas — accents/glows/circles funcionais)
- `emerald-*` Tailwind: zero ocorrências
- TSC: exit 0

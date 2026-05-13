# Design Tokens — Priddyspaces

> Every value Claude Code is allowed to use. If you need a value that isn't here, **stop and ask the user**.

These tokens live as CSS custom properties in `tokens.css`. Claude Code must replicate them in `webUI/tailwind.config.ts` (extending the existing config) and `webUI/app/_styles/tokens.css` (new file imported once in `app/layout.tsx`).

---

## Brand — Violet (primary)

| Token | Hex | Tailwind utility |
|---|---|---|
| `--ps-violet-50`  | `#F5F2FF` | `bg-violet-50` |
| `--ps-violet-100` | `#EAE3FF` | `bg-violet-100` |
| `--ps-violet-200` | `#D5C7FF` | `bg-violet-200` |
| `--ps-violet-300` | `#B59FFF` | `bg-violet-300` |
| `--ps-violet-400` | `#9576FF` | `bg-violet-400` |
| `--ps-violet-500` | `#7C5BF5` | `bg-violet-500` · **PRIMARY** |
| `--ps-violet-600` | `#6741E0` | `bg-violet-600` · primary hover |
| `--ps-violet-700` | `#5430C2` | `bg-violet-700` · primary pressed / strong text |
| `--ps-violet-800` | `#3F2596` | `bg-violet-800` |
| `--ps-violet-900` | `#28195D` | `bg-violet-900` |

## Accent — Mint (success / featured)

| Token | Hex |
|---|---|
| `--ps-mint-50`  | `#ECFBF5` |
| `--ps-mint-100` | `#D2F4E6` |
| `--ps-mint-300` | `#7FDDB8` |
| `--ps-mint-500` | `#2EB888` |
| `--ps-mint-700` | `#15885F` |

## Semantic

| Token | Foreground | Background (subtle) |
|---|---|---|
| Success | `#15885F` | `#ECFBF5` |
| Warning | `#B25B00` | `#FFF4E5` |
| Danger  | `#C0271F` | `#FDECEC` |
| Info    | `#1E5FD1` | `#EAF2FF` |

---

## Surfaces & text — Light theme

| Token | Hex | Use |
|---|---|---|
| `--bg`         | `#F8F7FB` | Page background |
| `--bg-elev`    | `#FFFFFF` | Elevated surfaces in chrome (topbar, sticky bars) |
| `--bg-sunken`  | `#F1EFF7` | Sunken sections (inside cards) |
| `--surface`    | `#FFFFFF` | Card body |
| `--surface-2`  | `#F4F2F9` | Card inner panel, chip bg, segmented control track |
| `--surface-3`  | `#ECE9F4` | Pressed states |
| `--line`       | `#ECE8F3` | Hairlines, default border |
| `--line-strong`| `#DDD7EC` | Input border, divider on focus |
| `--text`       | `#100A1F` | Primary text |
| `--text-2`     | `#4A4459` | Secondary |
| `--text-3`     | `#7A748A` | Tertiary (captions, hints) |
| `--text-4`     | `#A7A1B5` | Disabled / muted |

## Surfaces & text — Dark theme

| Token | Hex |
|---|---|
| `--bg`         | `#0B0916` |
| `--bg-elev`    | `#14112A` |
| `--bg-sunken`  | `#07061A` |
| `--surface`    | `#15122B` |
| `--surface-2`  | `#1C1937` |
| `--surface-3`  | `#252146` |
| `--line`       | `#232049` |
| `--line-strong`| `#312B5C` |
| `--text`       | `#F5F2FF` |
| `--text-2`     | `#C4BDE0` |
| `--text-3`     | `#8A82A8` |
| `--text-4`     | `#5C5479` |
| `--brand` (dark mode primary) | `#9576FF` |

Dark mode is the **`.dark` class on `<html>`** (Tailwind dark mode `'class'`).

---

## Typography

**Font families**:
- Sans / display: **Geist** (already loaded via Google Fonts in prototype). Add to `webUI/app/layout.tsx` with `next/font/google`.
- Mono / numerics: **Geist Mono**.

**Type scale** — these are the **only** sizes allowed:

| Token | px | Weight | Use |
|---|---|---|---|
| Display | 48 | 600 | Marketing hero only |
| H1 | 36 | 600 | Top-level page header (`<h1>` on dashboard hero) |
| H2 | 28 | 600 | Section header in marketing |
| H3 | 22 | 600 | Card section titles |
| H4 | 19 | 600 | Subsection titles |
| Body LG | 17 | 400-500 | Important body |
| Body MD | 15 | 400-500 | Default body inside cards |
| Body | 14 | 400-500 | Default body |
| Small | 13 | 400-500 | Secondary copy, table cells |
| Label | 12 | 500 | Form labels, chip text |
| Caption | 11 | 500-600 | Captions, eyebrow labels (uppercase + 0.06em tracking) |

**Letter spacing**:
- Headings (≥ 22px): `letter-spacing: -0.02em` (display + H1 + numerics: `-0.025em`)
- Body: `-0.005em` or default
- Caption labels (uppercase): `letter-spacing: 0.06em`

**Numerics**: use `font-family: var(--f-mono)` + `font-feature-settings: "tnum"` on any element showing currency, dates, percentages, or counts. Provide a `<Num>` helper component.

---

## Spacing scale

The only spacing values allowed (px):

```
4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64
```

Map to Tailwind: `1 / 2 / 3 / 4 / 5 / 6 / 8 / 10 / 12 / 16` (already standard).

---

## Radii

| Token | px | Tailwind |
|---|---|---|
| `--r-xs` | 6  | `rounded-md` (override or `rounded-[6px]`) |
| `--r-sm` | 8  | `rounded-lg` |
| `--r-md` | 12 | `rounded-xl` |
| `--r-lg` | 16 | `rounded-2xl` |
| `--r-xl` | 20 | `rounded-[20px]` |
| `--r-2xl`| 24 | `rounded-3xl` |
| `--r-pill`| 999| `rounded-full` |

Cards: 16. Inputs/buttons: 12. Chips/pills: 999.

---

## Shadows

```css
--shadow-xs:  0 1px 2px rgba(16, 10, 31, 0.04);
--shadow-sm:  0 1px 3px rgba(16, 10, 31, 0.06), 0 1px 2px rgba(16, 10, 31, 0.04);
--shadow-md:  0 4px 14px rgba(16, 10, 31, 0.05), 0 1px 3px rgba(16, 10, 31, 0.03);
--shadow-lg:  0 14px 40px rgba(40, 25, 93, 0.08), 0 4px 12px rgba(40, 25, 93, 0.04);
--shadow-pop: 0 24px 60px rgba(40, 25, 93, 0.18), 0 8px 20px rgba(40, 25, 93, 0.08);
```

Cards use `xs`. Floating menus/popovers: `lg`. Modals: `pop`.

In dark mode, shadows are **disabled on cards** (`box-shadow: none`); rely on `border` for separation.

---

## Focus ring

```css
--ring: rgba(124, 91, 245, 0.30);
```

Used as `box-shadow: 0 0 0 3px var(--ring)` on focused inputs and buttons. Never use `outline`.

---

## Motion

```css
--ease:        cubic-bezier(0.22, 0.61, 0.36, 1);   /* default */
--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);   /* toggles, springy reveals */
```

Durations:
- Hover/state change: `120ms`
- Show/hide: `180ms`
- Page transitions: `220ms`
- Spring (toggle, drawer): `250ms` with `--ease-spring`

Respect `prefers-reduced-motion: reduce` — disable transforms, keep opacity.

---

## Tailwind config patch

Add this to `webUI/tailwind.config.ts` (extend the existing config, don't replace):

```ts
theme: {
  extend: {
    colors: {
      // Existing tokens here — KEEP THEM during the transition.
      // New tokens below take precedence in NEW components.
      bg:          'var(--bg)',
      'bg-elev':   'var(--bg-elev)',
      'bg-sunken': 'var(--bg-sunken)',
      surface:     'var(--surface)',
      'surface-2': 'var(--surface-2)',
      'surface-3': 'var(--surface-3)',
      line:        'var(--line)',
      'line-strong': 'var(--line-strong)',
      text:        'var(--text)',
      'text-2':    'var(--text-2)',
      'text-3':    'var(--text-3)',
      'text-4':    'var(--text-4)',
      brand:       { DEFAULT: 'var(--brand)', hover: 'var(--brand-hover)', soft: 'var(--brand-soft)', strong: 'var(--brand-strong)' },
      violet: {
        50:'#F5F2FF',100:'#EAE3FF',200:'#D5C7FF',300:'#B59FFF',400:'#9576FF',
        500:'#7C5BF5',600:'#6741E0',700:'#5430C2',800:'#3F2596',900:'#28195D',
      },
      mint:    { 50:'#ECFBF5',100:'#D2F4E6',300:'#7FDDB8',500:'#2EB888',700:'#15885F' },
      success: { DEFAULT:'#15885F', soft:'var(--ps-success-bg)' },
      warning: { DEFAULT:'#B25B00', soft:'var(--ps-warning-bg)' },
      danger:  { DEFAULT:'#C0271F', soft:'var(--ps-danger-bg)' },
      info:    { DEFAULT:'#1E5FD1', soft:'var(--ps-info-bg)' },
    },
    borderRadius: {
      'xs': '6px', 'sm': '8px', 'md': '12px', 'lg': '16px',
      'xl': '20px', '2xl': '24px',
    },
    boxShadow: {
      xs:  'var(--shadow-xs)',
      sm:  'var(--shadow-sm)',
      md:  'var(--shadow-md)',
      lg:  'var(--shadow-lg)',
      pop: 'var(--shadow-pop)',
      ring:'0 0 0 3px var(--ring)',
    },
    fontFamily: {
      sans: ['Geist', 'system-ui', 'sans-serif'],
      mono: ['Geist Mono', 'ui-monospace', 'monospace'],
    },
    transitionTimingFunction: {
      DEFAULT: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      spring:  'cubic-bezier(0.34, 1.56, 0.64, 1)',
    },
  },
},
darkMode: 'class',
```

Add `tokens.css` content (from `_design_reference/tokens.css`) as the *first* import in `webUI/app/layout.tsx`.

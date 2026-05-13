# Claude Code — Priddyspaces UI/UX Redesign Implementation

> **Paste this entire README into Claude Code as your first message.** Then attach (or `cd` into) the `priddyspaces-app/` repo. Do not summarize, paraphrase, or skip sections — execute them in order.

---

## 0 · Identity & operating mode

You are implementing a **visual redesign** of an existing production Next.js + Tailwind app. The design is already finalized as a set of HTML/JSX prototypes in `_design_reference/`. Your job is to **port those prototypes 1:1 into the real codebase at `webUI/`** using its existing routing, data fetching, and component conventions.

You are **not** redesigning. You are **not** improvising values. You are **not** adding scope. You are translating a fixed visual spec into the existing app.

### Hard rules — read twice

1. **NEVER invent token values.** Every color, radius, shadow, spacing, font size, and animation value lives in `_design_reference/tokens.css` and `_design_reference/DESIGN_TOKENS.md`. If a value isn't in those files, **stop and ask** — do not guess.
2. **NEVER invent component variants.** The prototype components are the source of truth. If a screen needs a button/input/badge state that isn't in `_design_reference/shared.jsx`, **stop and ask**.
3. **NEVER change copy.** Every label, placeholder, error message, and microcopy string in the prototypes is intentional. Copy it verbatim, including punctuation, capitalization, and the em-dashes.
4. **NEVER touch backend, auth, routing, or data shapes** unless explicitly instructed in a numbered task. If a screen needs a field that doesn't exist in the current API, **add a TODO comment and ask** — don't silently mock it.
5. **NEVER rip out working pages and rewrite from scratch.** Edit in place. Preserve existing data hooks, `use client` boundaries, and form/validation logic. Replace markup and styling only.
6. **One PR per phase.** Phases are listed in §6. Finish a phase, run the verification checklist, commit, and report back **before** moving on.
7. **If you find yourself writing more than ~150 lines without consulting `_design_reference/`, you are hallucinating.** Stop, re-read the relevant prototype JSX, and continue.

---

## 1 · What's in this bundle

```
_design_reference/
├── README.md                    ← this file
├── DESIGN_TOKENS.md             ← every token, with exact values + Tailwind mappings
├── COMPONENT_PATTERNS.md        ← prototype component → shadcn/Tailwind pattern table
├── COPY.md                      ← every user-facing string, grouped by screen
├── PHASED_PLAN.md               ← the order to work in, with acceptance criteria
├── tokens.css                   ← raw CSS variables (light + dark)
├── shared.jsx                   ← prototype shell, sidebar, topbar, atoms
├── index.html                   ← canvas that hosts every artboard
├── app.jsx                      ← canvas composition (which artboards exist)
└── artboards/
    ├── foundations.jsx          ← brand, type, color, spacing showcase
    ├── owner-dashboard.jsx      ← empty + populated dashboard
    ├── owner-calendar.jsx       ← week + timeline views
    ├── owner-requests.jsx       ← requests inbox
    ├── owner-analytics.jsx      ← analytics with charts + heatmap
    ├── owner-locations.jsx      ← locations cards
    ├── owner-settings.jsx       ← settings with section nav
    ├── customer-marketplace.jsx ← public search + map
    ├── customer-listing.jsx     ← listing detail + booking widget
    ├── booking-flow.jsx         ← multi-step checkout
    ├── mobile-views.jsx         ← 3 mobile screens
    └── command-palette.jsx      ← ⌘K overlay
```

Open `index.html` in a browser to see all 16 artboards on one canvas. That canvas is the spec — when in doubt, render the prototype and compare pixel-for-pixel.

---

## 2 · Target codebase

Stack: **Next.js (App Router) + TypeScript + TailwindCSS + Playwright + Vitest**. Located at `webUI/`. Component files: `webUI/components/`. Page routes: `webUI/app/`.

Existing token file: `webUI/tailwind.config.ts` — currently defines a leaner palette. You will **extend** it with the new tokens from `tokens.css`, not replace it (until phase 7 cleanup).

Conventions to obey:
- Functional components with hooks; no class components.
- Server Components by default; `'use client'` only when needed (forms, modals, drag, motion).
- Tailwind utility classes for everything except dynamic values; no inline `style={}` except for computed positions, gradient stops, or chart geometry.
- Icons: existing app uses `lucide-react`. The prototype uses inline SVGs — **map them to `lucide-react`** using the table in `COMPONENT_PATTERNS.md`. Do not embed raw SVG icons unless lucide doesn't have an equivalent.
- Forms: `react-hook-form` + `zod`. Don't replace existing schemas — wrap them.
- Tables: `@tanstack/react-table` if already in the codebase, otherwise plain table elements.

---

## 3 · Design tokens — the only colors / sizes you may use

**Read `DESIGN_TOKENS.md` in full before writing any CSS.** A summary:

- **Primary**: `#7C5BF5` (violet-500). Hover: `#6741E0` (violet-600). Soft bg: `#F5F2FF` (violet-50). On-primary text: `#FFFFFF`.
- **Accent (success / featured)**: `#2EB888` (mint-500). Soft: `#ECFBF5` (mint-50). Strong: `#15885F` (mint-700).
- **Semantic**: success `#15885F`, warning `#B25B00`, danger `#C0271F`, info `#1E5FD1`.
- **Surfaces (light)**: page `#F8F7FB`, card `#FFFFFF`, sunken `#F1EFF7`, hairline `#ECE8F3`.
- **Text (light)**: primary `#100A1F`, secondary `#4A4459`, tertiary `#7A748A`, quaternary `#A7A1B5`.
- **Radii**: `8 / 12 / 16 / 20 / 24 / 999px` — that's the entire scale.
- **Spacing**: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64` only.
- **Type**: Geist (sans + mono). Numerics use mono + `font-feature-settings: "tnum"`.
- **Shadow `lg`**: `0 14px 40px rgba(40,25,93,0.08), 0 4px 12px rgba(40,25,93,0.04)`.

If a Figma-imported value differs from these, the **prototype wins**.

---

## 4 · Component mapping

Use `COMPONENT_PATTERNS.md`. The short version:

| Prototype | Real codebase |
|---|---|
| `.ps-btn` | `<Button>` from `webUI/components/ui/button.tsx` (variants: `default`, `outline`, `ghost`, `primary`, `sm`, `lg`) |
| `.ps-input` | `<Input>` from `webUI/components/ui/input.tsx` |
| `.ps-chip` | New `<Badge>` variant: `default | violet | mint | success | warning | danger | info` |
| `.ps-card` | `<Card>` — `bg-surface border border-line rounded-2xl shadow-sm` |
| `PSShell` | New `<WorkspaceShell>` in `webUI/components/shell/` |
| `PSSidebar` | New `<Sidebar>` in `webUI/components/shell/sidebar.tsx`. Variants `owner | customer` |
| `StatCard` | New `<StatCard>` in `webUI/components/charts/stat-card.tsx` |
| `Sparkline`, `Donut`, `Heatmap`, `RevenueBarChart`, `RevenueChart` | Each gets its own file in `webUI/components/charts/`. **Copy the SVG math verbatim** — don't reach for Recharts. |
| `Icons.*` | `lucide-react` — see mapping table in `COMPONENT_PATTERNS.md` |

---

## 5 · Screen-by-screen targets

Each prototype artboard maps to a real Next.js route. Refactor in this order; do **not** skip ahead.

| # | Prototype artboard | Real route | Real file(s) |
|---|---|---|---|
| 1 | `foundations.jsx` | (none — feeds `tailwind.config.ts` + Storybook if present) | `webUI/tailwind.config.ts`, `webUI/app/_styles/tokens.css` |
| 2 | `owner-dashboard.jsx` (populated) | `/owner` or `/owner/dashboard` | `webUI/app/owner/page.tsx` |
| 3 | `owner-dashboard.jsx` (empty) | Same route, conditional render based on `hasLocations` | Same file |
| 4 | `owner-calendar.jsx` | `/owner/calendar` | `webUI/app/owner/calendar/page.tsx` |
| 5 | `owner-requests.jsx` | `/owner/requests` | `webUI/app/owner/requests/page.tsx` |
| 6 | `owner-analytics.jsx` | `/owner/analytics` | `webUI/app/owner/analytics/page.tsx` |
| 7 | `owner-locations.jsx` | `/owner/locations` | `webUI/app/owner/locations/page.tsx` |
| 8 | `owner-settings.jsx` | `/owner/settings` | `webUI/app/owner/settings/page.tsx` |
| 9 | `customer-marketplace.jsx` | `/` or `/spaces` (whichever currently shows public search) | check `webUI/app/page.tsx` and `webUI/app/spaces/` |
| 10 | `customer-listing.jsx` | `/spaces/[id]` or equivalent | inspect `webUI/app/spaces/`, `webUI/app/meeting-rooms/`, `webUI/app/private-offices/` |
| 11 | `booking-flow.jsx` | `/spaces/[id]/book` or wherever booking lives today | trace from listing detail's CTA |
| 12 | `mobile-views.jsx` | Same routes; responsive breakpoints `<md`, `<lg` | each affected page |
| 13 | `command-palette.jsx` | Global — mount in `webUI/app/layout.tsx` behind `⌘K` | new `webUI/components/command-palette/` |

Before editing each route, **read the existing page top-to-bottom** so you know what data hooks, params, and side-effects it already has. Preserve those.

---

## 6 · Phased plan — do these in order

See `PHASED_PLAN.md` for the detailed checklist per phase. The 7 phases:

1. **Tokens & primitives** — extend `tailwind.config.ts`, add tokens.css, create `<Button>`, `<Input>`, `<Card>`, `<Badge>`, `<Avatar>` matching the prototype. Done = prototype `foundations` artboard reproducible with new primitives.
2. **Shell** — `<WorkspaceShell>`, `<Sidebar>` (owner + customer variants), `<Topbar>`. Wired into the existing `(owner)` layout. No new pages yet — every existing owner page should now sit inside the new shell.
3. **Owner dashboard** (empty + populated states, KPI cards, TimelineMini, RevenueChart, Locations list, Requests inbox).
4. **Owner ops** — Requests, Analytics (all four charts), Locations.
5. **Owner Calendar + Settings** — week-grid, timeline, settings split.
6. **Customer surfaces** — Marketplace search + map, Listing detail, Booking flow.
7. **Patterns + polish** — Command palette (⌘K), keyboard shortcuts, mobile responsive pass, dark mode toggle, accessibility audit.

After each phase: run `npm run lint`, `npm run test`, take 1 desktop + 1 mobile screenshot of each affected route, and **stop**. Don't continue until the user signs off.

---

## 7 · Anti-hallucination protocol

When you're about to write code, ask yourself:

- **"Is this value in `DESIGN_TOKENS.md`?"** If no, stop.
- **"Does this UI pattern exist in `_design_reference/`?"** If no, stop and ask.
- **"Am I copying a label/string verbatim from the prototype?"** If you're rewording, stop.
- **"Did I read the existing route file before editing it?"** If no, read it first.
- **"Am I keeping the same data hooks the page already uses?"** You must.

If you catch yourself drafting more than ~150 lines without re-opening a prototype file, **stop and re-anchor.** Open the relevant artboard JSX in the editor before continuing.

---

## 8 · How to verify your work

For every route you touch, before declaring it done:

1. **Side-by-side check**: Open the prototype artboard in `index.html` and your implementation in the dev server. They should match within ~4px on a 1440-wide canvas.
2. **Token grep**: `grep -rE '#[0-9A-Fa-f]{3,8}' webUI/app/<route>/` — should return zero hits. All colors come from Tailwind tokens.
3. **Magic-number grep**: `grep -rE '\b(11|13|15|17|19|21|23)px\b' webUI/app/<route>/` — type sizes must come from the type scale.
4. **Dark mode**: Toggle `class="dark"` on `<html>` — the page must remain legible with no contrast failures.
5. **Mobile**: Resize to 390px — sticky CTA renders, tables collapse to cards, bottom nav appears on customer routes.
6. **Keyboard**: Tab through every interactive element. Focus rings must be visible and use `--ring`.
7. **No console errors** in Chrome devtools.

Run the prototype's `index.html` in one browser window and the real app in another. **Don't ship a phase until they're indistinguishable.**

---

## 9 · When to ask vs. when to ship

| Situation | Action |
|---|---|
| Token value missing | **Ask** |
| Existing API field missing for a new UI piece | **Ask** — add a TODO with `// HANDOFF:` prefix in the code |
| Existing page has logic you don't recognize | **Read the file fully first.** If still unclear, ask. |
| Copy from prototype seems wrong/weird | **Use it anyway.** Don't second-guess copy. |
| Prototype and existing data shape conflict | **Ask** with both shapes side-by-side |
| Phase complete, all checks pass | **Ship the PR.** Don't start the next phase. |

---

## 10 · Definition of done

You've completed the redesign when:

- [ ] Every route in §5 visually matches its prototype artboard
- [ ] `tailwind.config.ts` reflects the new token set; old custom colors are removed
- [ ] `lucide-react` is the only icon source (no inline SVG icons except charts)
- [ ] Dark mode works on every owner + customer route
- [ ] ⌘K command palette is mounted globally
- [ ] Every interactive element is keyboard-reachable with a visible focus ring
- [ ] Lighthouse accessibility score ≥ 95 on three sampled pages
- [ ] All existing Playwright/Vitest tests still pass
- [ ] No `// HANDOFF:` TODOs left unresolved (or each is filed as a follow-up issue)

---

**Start with Phase 1. Read `PHASED_PLAN.md`. Confirm you understand before writing code.**

# Component Patterns

> Mapping from prototype components to real-codebase equivalents. **The prototype file is always the source of truth** — open it side-by-side when implementing.

---

## Atom mapping

### Button — `Button`

**Prototype**: `.ps-btn` in `shared.jsx` (lines for `.ps-btn-primary`, `.ps-btn-ghost`, `.ps-btn-sm`, `.ps-btn-lg`).

**Real**: extend existing `webUI/components/ui/button.tsx`. Variants:

| Variant | Background | Border | Text |
|---|---|---|---|
| `default` | `bg-surface` | `border-line-strong` | `text-text` |
| `primary` | `bg-brand` | `border-brand` | `text-white` |
| `ghost` | transparent | transparent | `text-text` |
| `outline-danger` | `bg-surface` | `border-danger/30` | `text-danger` |

Sizes: `sm` (h-30 / px-10), `default` (h-36 / px-14), `lg` (h-44 / px-18). Radius: `rounded-xl`.

Hover (non-primary): `hover:border-text-3`. Hover (primary): `hover:bg-brand-hover`.

Focus: `focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2`.

---

### Input — `Input`

**Prototype**: `.ps-input`.

**Real**: `webUI/components/ui/input.tsx`. Use `h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] outline-none transition focus:border-brand focus:shadow-ring`.

`placeholder:text-text-4`.

---

### Card — `Card`

**Prototype**: `.ps-card`.

**Real**: `bg-surface border border-line rounded-2xl shadow-xs dark:shadow-none`.

Padding is **not** baked into the card — pass it through (`p-4`, `p-5`, `p-6`).

---

### Badge / Chip — `Badge`

**Prototype**: `.ps-chip`, `.ps-chip-violet`, `.ps-chip-mint`, `.ps-chip-success`, `.ps-chip-warning`, `.ps-chip-danger`, `.ps-chip-info`.

**Real**: extend `webUI/components/ui/badge.tsx` (or create). Variants map 1:1. Each: `inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-medium`.

Backgrounds + text colors:

| Variant | Background | Text |
|---|---|---|
| `default` | `bg-surface-2` | `text-text-2` |
| `violet`  | `bg-violet-50 dark:bg-brand/15` | `text-violet-700 dark:text-violet-200` |
| `mint`    | `bg-mint-50` | `text-mint-700` |
| `success` | `bg-success-soft` | `text-success` |
| `warning` | `bg-warning-soft` | `text-warning` |
| `danger`  | `bg-danger-soft` | `text-danger` |
| `info`    | `bg-info-soft` | `text-info` |

Status badges (`StatusBadge` in prototype): always include the dot:

```tsx
<Badge variant={tone}><span className="w-1.5 h-1.5 rounded-full bg-current" />{label}</Badge>
```

---

### Avatar — `Avatar`

**Prototype**: `Avatar` in `shared.jsx`. Generates initials + a gradient seeded by name's first char.

**Real**: keep the same algorithm. Five gradients hard-coded:

```ts
const palettes = [
  ['#FFD074', '#FF9E5E', '#5a2a00'],  // amber
  ['#B59FFF', '#7C5BF5', '#28195D'],  // violet
  ['#7FDDB8', '#2EB888', '#0a3a2a'],  // mint
  ['#FFC4D9', '#FF7AA2', '#5a1030'],  // rose
  ['#A8C7FF', '#5E8EFF', '#0c2c60'],  // blue
];
const idx = (name.charCodeAt(0) || 0) % 5;
```

---

### Kbd — `Kbd`

**Prototype**: `.ps-kbd`. **Real**: new `<Kbd>` — `inline-flex h-5 min-w-[18px] px-1.5 rounded-[5px] bg-surface-2 border border-b-2 border-line-strong text-text-2 font-mono text-[11px] items-center justify-center`.

---

## Shell / chrome

### `WorkspaceShell`

**Prototype**: `PSShell` in `shared.jsx`. Two-column grid: `232px 1fr`.

```tsx
<div className="grid grid-cols-[232px_1fr] h-screen bg-bg text-text overflow-hidden">
  <Sidebar variant={...} />
  <div className="flex flex-col overflow-hidden min-w-0">
    <Topbar ... />
    <main className="flex-1 overflow-auto px-8 py-7">{children}</main>
  </div>
</div>
```

### `Sidebar`

Sections: see `PSSidebar` source. Two variants:

- `owner`: groups `Overview` (Dashboard, Calendar, Requests), `Operations` (Members, Locations, Inventory, Team), `Growth` (Marketing, Loyalty, Analytics), `Finance` (Payments, Invoices).
- `customer`: groups `Workspace` (Discover, My bookings, Memberships, Invoices), `Account` (Profile, Billing).

Pinned at top: workspace switcher (logo + name + chev). Below it: search button that triggers `⌘K`. Pinned at bottom: user profile chip.

Active state: `bg-brand-soft text-brand-strong`. Inactive: `text-text-2 hover:bg-surface-2`.

Counts/badges (e.g. `Requests · 4`): on the right of the row.

### `Topbar`

Slot for: `breadcrumb`, `title`, `badge`, `actions`. 60px tall. Border-bottom. Notification bell with red dot on the right.

---

## KPI / charts

### `StatCard`

**Prototype**: `StatCard` in `shared.jsx`.

Layout (top-down):
1. Header row: icon chip (26×26, rounded-md, soft bg matching accent) + label + delta pill on the right
2. Value row: large mono numeric (26px or 32px if `large`) + optional sparkline on the right
3. Optional `sub` caption

Props: `label, value, delta, deltaPositive, sub, sparkline (number[]), icon, accent: 'violet'|'mint'|undefined, large`.

### `Sparkline`

SVG path of `points`. **Copy the math verbatim** from `owner-dashboard.jsx`. Width default 80, height 24. Fill the area below the line at 0.12 opacity in the same color.

### `RevenueChart` (stacked area)

Two layers: memberships baseline + bookings on top. Gradients defined inline. See `RevenueChart` in `owner-dashboard.jsx` — **copy SVG paths exactly**.

### `RevenueBarChart`

30 bars, today is full brand color, last 7 days `violet-300`, older `violet-200`. See `owner-analytics.jsx`.

### `Donut`

CSS-only SVG donut with stacked slice strokes (no chart lib). 4 slices, center label. See `Donut` in `owner-analytics.jsx`.

### `Heatmap`

7 rows × 12 columns. Color buckets at `<0.15 / <0.3 / <0.5 / <0.7 / ≥0.7`. See `Heatmap` in `owner-analytics.jsx`. **Real data hook**: should accept a `Record<weekday, Record<hour, count>>` and the bucketing logic auto-applies.

### `TimelineMini`, `WeekView`, `DayTimeline`

Calendar grids drawn with absolutely positioned event blocks against a `position: relative` row. **Do not** swap for FullCalendar / TUI calendar. The prototype geometry is the spec.

Event tone map:

```ts
{
  violet:  ['rgba(124,91,245,.13)',  'var(--brand)',        'var(--brand-strong)'],
  mint:    ['rgba(46,184,136,.13)',  'var(--mint-500)',     'var(--mint-700)'],
  pending: ['rgba(178,91,0,.13)',    'var(--warning)',      'var(--warning)'],
  warning: ['rgba(178,91,0,.13)',    'var(--warning)',      'var(--warning)'],
  muted:   ['var(--surface-2)',      'var(--text-4)',       'var(--text-4)'],
}
```

The left edge of each event block is a 3px coloured border. The "now" line is 2px `bg-brand`.

---

## Icon mapping → lucide-react

Replace the prototype's inline `Icons.*` with `lucide-react` imports:

| Prototype | lucide-react |
|---|---|
| `Icons.home` | `Home` |
| `Icons.calendar` | `Calendar` |
| `Icons.inbox` | `Inbox` |
| `Icons.users` | `Users` |
| `Icons.user` | `User` |
| `Icons.mail` | `Mail` |
| `Icons.star` | `Star` |
| `Icons.chart` | `LineChart` |
| `Icons.pin` | `MapPin` |
| `Icons.box` | `Box` |
| `Icons.plus` | `Plus` |
| `Icons.settings` | `Settings` |
| `Icons.search` | `Search` |
| `Icons.bell` | `Bell` |
| `Icons.arrow_r` | `ArrowRight` |
| `Icons.arrow_l` | `ArrowLeft` |
| `Icons.chev_d` | `ChevronDown` |
| `Icons.chev_r` | `ChevronRight` |
| `Icons.check` | `Check` |
| `Icons.x` | `X` |
| `Icons.more` | `MoreHorizontal` |
| `Icons.filter` | `SlidersHorizontal` |
| `Icons.clock` | `Clock` |
| `Icons.dollar` | `DollarSign` |
| `Icons.trend_up` | `TrendingUp` |
| `Icons.trend_dn` | `TrendingDown` |
| `Icons.building` | `Building2` |
| `Icons.wifi` | `Wifi` |
| `Icons.car` | `Car` |
| `Icons.coffee` | `Coffee` |
| `Icons.command` | `Command` |
| `Icons.sparkle` | `Sparkles` |
| `Icons.zap` | `Zap` |
| `Icons.card` | `CreditCard` |
| `Icons.doc` | `FileText` |
| `Icons.megaphone` | `Megaphone` |
| `Icons.globe` | `Globe` |
| `Icons.map` | `Map` |
| `Icons.sun` | `Sun` |
| `Icons.moon` | `Moon` |
| `Icons.printer` | `Printer` |

Default icon size: `16` (in toolbars, lists), `14` (in chips), `18-20` (in feature blocks). Always set `strokeWidth={1.6}` for default, `2` for chips, `2.5` for primary-button leading icons.

---

## Forms

### `Field`

**Prototype**: `Field` in `owner-settings.jsx`. Label (12px / 500) on top, control below, optional hint underneath (11px / `text-text-3`).

```tsx
<div>
  <Label className="text-[12px] font-medium mb-1.5">{label}</Label>
  {children}
  {hint && <p className="text-[11px] text-text-3 mt-1.5">{hint}</p>}
</div>
```

### `Toggle`

**Prototype**: `Toggle` in `owner-settings.jsx`. 32×18 track, 14×14 thumb. Spring transition. Use Radix `Switch` underneath with custom styling.

### `StepPill` / `StepConnector`

For multi-step flows (booking checkout). 22px circle. Brand fill when done, ring + soft-bg when active. See `booking-flow.jsx`.

---

## Layout patterns

### "Bulk action bar" (Requests page)

Sticky violet-tinted bar appearing above the table when rows are selected. See `OwnerRequests`. Use `bg-brand-soft border-brand`.

### "Empty state with onboarding progress"

See `OwnerDashboardEmpty`. Six steps with check/active/upcoming states. Active step has a 4px ring.

### "Sticky booking widget" (Listing detail)

`position: sticky; top: 20px` on a column inside a 2-column grid. Width 380px on desktop, full-width below `lg`.

### "Bottom sheet" / "Sticky CTA" (mobile)

Bottom-pinned action bar with shadow above it: `box-shadow: 0 -4px 20px rgba(16,10,31,.06)`. Safe-area padding bottom.

---

## Dark mode rules

1. Apply via `class="dark"` on `<html>`.
2. Cards lose shadow in dark mode — rely on border instead.
3. The brand color brightens: `#7C5BF5` → `#9576FF`.
4. Avoid pure white text on pure black — use the dark token palette exactly.
5. Test every screen in both modes before shipping.

---

## Anti-patterns — do **not** do these

- ❌ `<div style={{ color: '#7C5BF5' }}>` — use `text-brand` or `text-violet-500`.
- ❌ `border-radius: 10px` — only 8/12/16/20/24/999 are allowed.
- ❌ Embedding a Recharts/Chart.js library — the prototype SVG math is the implementation.
- ❌ Rewriting `<Sidebar>` from scratch for a customer page when the `customer` variant of `<Sidebar>` already exists.
- ❌ Using `text-gray-500` — use `text-text-3`.
- ❌ Skipping dark mode "because the screen is mostly empty".

# Phased Plan

> Do these in order. Each phase has explicit acceptance criteria. **Do not start phase N+1 until N is signed off by the user.**

Tag every PR title with `[redesign-pN]` (e.g., `[redesign-p3] Owner dashboard`).

---

## Phase 1 — Tokens & primitives

**Goal**: every value in the design system is defined; primitive components match the prototype.

**Tasks**:
1. Add `webUI/app/_styles/tokens.css` — copy `tokens.css` from this bundle verbatim. Import once in `app/layout.tsx`.
2. Patch `webUI/tailwind.config.ts` with the extension block from `DESIGN_TOKENS.md` § Tailwind config patch. **Keep existing tokens** during migration.
3. Add Geist + Geist Mono via `next/font/google` in `app/layout.tsx`.
4. Set `darkMode: 'class'` in tailwind.config.ts.
5. Build / update primitives in `webUI/components/ui/`:
   - `button.tsx` — variants `default | primary | ghost | outline-danger`, sizes `sm | default | lg`.
   - `input.tsx` — token-based.
   - `card.tsx` — `bg-surface border border-line rounded-2xl shadow-xs dark:shadow-none`.
   - `badge.tsx` — variants per `COMPONENT_PATTERNS.md`.
   - `avatar.tsx` — initials + seeded gradient algorithm.
   - `kbd.tsx` — new.
   - `field.tsx` — label / control / hint wrapper.
   - `toggle.tsx` — wrap Radix Switch with token styling.

**Acceptance**:
- [ ] `npm run build` passes.
- [ ] Visiting any existing page in dark mode (toggle `<html class="dark">` in devtools) doesn't crash.
- [ ] Stand up a temporary `/_design/foundations` page that renders the new primitives and verify it matches the prototype's `Foundations` artboard.

---

## Phase 2 — Shell (sidebar + topbar + workspace shell)

**Goal**: every existing owner / customer page now sits inside the new shell — markup unchanged for now.

**Tasks**:
1. `webUI/components/shell/sidebar.tsx` — variants `owner | customer`. Active state computed from `usePathname()`. Active item highlighted with `bg-brand-soft text-brand-strong`.
2. `webUI/components/shell/topbar.tsx` — slots for `breadcrumb`, `title`, `badge`, `actions`. Notification bell on the right.
3. `webUI/components/shell/workspace-shell.tsx` — wraps `Sidebar + Topbar + main`. 232px sidebar.
4. Refactor `webUI/app/owner/layout.tsx` (and customer layout, if exists) to use the new shell.
5. **Do not touch page bodies yet.** Pages still render their old content inside the new chrome.
6. Workspace switcher at the top of sidebar — for now just shows the org name; dropdown is a stub.

**Acceptance**:
- [ ] All existing owner routes render inside the new chrome without breaking.
- [ ] Sidebar active state correctly reflects current route on `/owner`, `/owner/calendar`, `/owner/requests`, etc.
- [ ] Sidebar collapses gracefully on mobile (`<lg`) — show as a slide-over.

---

## Phase 3 — Owner dashboard

**Goal**: `/owner` matches the prototype dashboard artboards (empty + populated).

**Tasks**:
1. Implement these shared widgets in `webUI/components/charts/`:
   - `stat-card.tsx` (with inline sparkline support)
   - `sparkline.tsx`
   - `revenue-chart.tsx` (stacked area)
2. Build the dashboard hero ("Good morning, Jane.") with greeting + summary.
3. Build the KPI strip (4 cards across).
4. Build the today timeline (`<TimelineMini>`) — port the absolutely positioned event blocks from `owner-dashboard.jsx`.
5. Build the pending requests panel.
6. Build the locations summary list with occupancy progress bars.
7. Empty state: if `hasLocations === false`, render `OwnerDashboardEmpty` (welcome card + 6-step progress + onboarding cards + muted KPIs + resources).
8. Wire data sources: keep whatever the existing dashboard uses (don't change the API).

**Acceptance**:
- [ ] Populated dashboard at `/owner` matches prototype within ~4px.
- [ ] Empty state visible to a freshly-created org that has no locations.
- [ ] Dark mode works on both states.
- [ ] All numerics use mono + `tnum`.

---

## Phase 4 — Owner ops (Requests, Analytics, Locations)

### 4a. Requests inbox (`/owner/requests`)

- Filter tabs (All / Pending / Approved / Payment failed / Rejected) with counts; failed tab has danger badge.
- Bulk action bar (violet-tinted) appears when rows are selected.
- Table columns: requester, space & time, note, payment, status, actions.
- Per-row inline approve (green check button) + reject + more menu.
- Pagination at the bottom.

### 4b. Analytics (`/owner/analytics`)

- Build remaining chart components: `revenue-bar-chart.tsx`, `donut.tsx`, `heatmap.tsx`.
- Tabs: Overview / Occupancy / Revenue / Members / Peak hours.
- KPI strip (4 cards) + revenue daily bar + donut by space type + heatmap + top members + retention/avg-value/cancellations strip.

### 4c. Locations (`/owner/locations`)

- Card grid (2 columns).
- Each `LocationCard` shows: gradient hero, status chip (Live / Onboarding), name + address, metrics (rooms / occupancy / MTD net), amenity icons, action row.
- "Add new location" dashed card at the end.

**Acceptance**:
- [ ] Filters and bulk approve work end-to-end (or are stubbed with a clear TODO if backend isn't ready).
- [ ] All four chart types render correctly with realistic data **and** the empty state ("No data").
- [ ] Heatmap colors map correctly to the 5 buckets in `_design_reference/`.

---

## Phase 5 — Owner Calendar + Settings

### 5a. Calendar (`/owner/calendar`)

- View tabs (Day / Week / Month / Timeline / List) — Week + Timeline must be implemented; the others can stub with "Coming soon" if not in scope.
- Filter strip with locations / type chips.
- Two-column layout: main calendar + inspector panel (selected booking detail) on the right.
- `WeekView`: 7 columns × hours, today column highlighted with brand-soft, "now" line, events with 3px left border.
- `DayTimeline`: row per room, horizontal timeline.

### 5b. Settings (`/owner/settings`)

- Split layout: 220px section nav on the left, scrolling content on the right.
- Group headers in the nav: Organization / Operations / Growth / Platform.
- Sections to ship: Organization profile, Amenities, Pricing rules table, Stripe panel, AI assistant policies.
- Each section in a `Card` with title + sub + content.
- Save changes button in the topbar persists across the page (single submit).

**Acceptance**:
- [ ] Calendar selection state syncs between grid and inspector.
- [ ] Settings save survives a page reload (use existing API).
- [ ] Pricing rules table allows add/edit/delete (or stub-with-TODO if backend isn't ready).

---

## Phase 6 — Customer surfaces

### 6a. Marketplace (`/` or `/spaces`)

- Top bar with logo + nav + Sign in / Get started.
- Hero search card with 4 categories (Coworking / Meeting rooms / Private offices / Event spaces).
- Inline search bar (Where / When / Capacity) + Search button.
- Filter chips below.
- Result cards (with hero gradient, host, capacity, rating, amenities, price, "Book →").
- Right column: map (replace with real Google Maps / Mapbox component using existing key if any; otherwise keep the SVG placeholder).
- Map pin hover/click → mini-preview card pinned to map bottom.

### 6b. Listing detail (`/spaces/[id]`)

- Image gallery (1 hero + 4 thumbs).
- Title / rating / location.
- Quick-facts chip row.
- Host strip with Message button.
- About + Amenities + Hours + Map.
- Right column: sticky booking widget (rate toggle, date, time, slot picker, price breakdown, Reserve button, cancellation policy strip).

### 6c. Booking flow

- Multi-step header (Sign in → Your info → Payment → Confirm) with step pills.
- Step 2 (Your info): contact form, add-ons, cancellation policy explainer, back/continue.
- Right column: booking summary (sticky).
- Steps 1/3/4: stub or implement based on existing flow.

**Acceptance**:
- [ ] Search bar filters update the URL (keep existing URL state if the app already does this).
- [ ] Listing detail booking widget computes total live as date/time/duration change.
- [ ] Booking flow preserves existing payment integration (Stripe).
- [ ] Mobile responsive — gallery becomes a single hero with thumbnails below; sticky CTA appears.

---

## Phase 7 — Patterns, mobile, polish

### 7a. Command palette (⌘K)

- Mount globally in `webUI/app/layout.tsx`.
- Use `cmdk` (or build on Radix Dialog) with the exact result groups in `command-palette.jsx`: Quick actions, Pending requests, Navigation, Help.
- Keyboard shortcuts: ⌘K to open, esc to close, ↑↓ to navigate, ↵ to select, ⌘↵ to open in new tab.
- Scope chips at top (location / time range).
- AI hand-off row at the bottom of the result list.

### 7b. Mobile responsive

- Walk every owner route at 390px width — tables collapse to cards, sidebar becomes drawer, bottom nav appears.
- Mobile bottom nav for customer + owner (4 tabs each, per prototypes).
- Sticky CTAs at the bottom of any actionable mobile screen.

### 7c. Dark mode toggle

- Add a `<ThemeToggle>` in the topbar (sun/moon icon).
- Persist preference in localStorage; respect `prefers-color-scheme` on first load.

### 7d. Accessibility audit

- Focus rings visible on every interactive element.
- Color contrast WCAG-AA on every text/bg pair.
- All form fields have associated `<Label>`.
- Tables have `<th scope>` and visible row hover.
- Lighthouse accessibility score ≥ 95 on `/owner`, `/owner/requests`, `/spaces/[id]`.

### 7e. Cleanup

- Remove old, unused custom colors / tokens from `tailwind.config.ts`.
- Delete dead components left over from the old design.
- Sweep for `// HANDOFF:` TODOs — file each as a follow-up issue.

**Acceptance**:
- [ ] ⌘K works on every page.
- [ ] Lighthouse a11y ≥ 95 on the three sampled pages.
- [ ] Existing Playwright + Vitest suites all pass.

---

## Reporting back

After each phase, post a short status to the user:

```
## [redesign-pN] <phase title> — done

Changes:
- <bullet>
- <bullet>

Screenshots:
- <route> — desktop + dark + mobile
- ...

Outstanding TODOs (`// HANDOFF:`):
- <bullet>

Ready to start pN+1? (Y/N)
```

Wait for explicit user "Y" before continuing.

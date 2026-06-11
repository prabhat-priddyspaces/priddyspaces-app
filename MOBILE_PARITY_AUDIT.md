# Mobile Parity Audit

Goal: bring `mobile/` (Expo / React Native) to functional + UI parity with `webUI/` (Next.js App Router) — same capabilities, data, states, and auth/org gating, while preserving intentional mobile-native patterns.

- **Last updated:** 2026-06-11 (Step 0 — discovery run, no code changed)
- **Web root:** `webUI/app` — Next.js App Router, 97 `page.tsx` routes
- **Mobile root:** `mobile/` — Expo + classic React Navigation (NOT expo-router); navigator at `mobile/src/navigation/AppNavigator.tsx`, 32 screens under `mobile/src/screens/`

## 1. Architecture summary

**Mobile navigation** (`mobile/src/navigation/AppNavigator.tsx`):
- Signed out → `LoginScreen` / `RegisterScreen` (Clerk via `@clerk/expo`).
- Signed in, no `me.role`/`me.platform_role` → `OnboardingScreen`; owner without org → `OrgOnboardingScreen`.
- Role-based bottom tabs: `MemberTabs` (Marketplace stack, Calendar, Bookings, AccessPasses, MySpaceQr, Directory, Profile), `OwnerTabs` (Dashboard, Scanner, Attendance, Locations, Bookings, Profile), `AdminTabs` (Scanner, Attendance, Profile).
- A shared stack of secondary screens reached from `MenuScreen` (hamburger) — see matrix.
- Push-tap routing exists only for `booking_public_id` → `BookingDetail` (`AppNavigator.tsx:232-245`). **No deep-link `scheme` configured in `mobile/app.json`.**

**Auth/tenancy** — both platforms derive gating from `GET /api/me`:
- Web: `useMe()` (`webUI/lib/me.ts`) + per-group layouts `webUI/app/member/layout.tsx`, `webUI/app/owner/layout.tsx`, `webUI/app/admin/layout.tsx`; `getDefaultRoute(me)` routing; impersonation supported.
- Mobile: `mobile/src/context/AuthContext.tsx` (`me.role`, `me.platform_role`, `me.has_organization`); no impersonation support.

## 2. Shared vs duplicated

**Nothing is shared between `webUI/` and `mobile/` — full duplication, no common package.**

| Concern | Web | Mobile |
|---|---|---|
| API client | `webUI/lib/api.ts` (`apiFetch`, auth retry) | `mobile/src/lib/api.ts` (`apiFetch`) |
| Availability math | `webUI/lib/space-availability.ts` | `mobile/src/lib/spaceAvailability.ts` |
| Access passes types/calls | `webUI/lib/access-passes.ts` | `mobile/src/lib/accessPasses.ts` |
| Notifications types/calls | `webUI/lib/notifications.ts` | `mobile/src/lib/notifications.ts` |
| Phone sanitizing | `webUI/lib/phone.ts` | `mobile/src/lib/phone.ts` |
| `me` types | `webUI/lib/me.ts` | inline in `AuthContext.tsx` |
| Design tokens | hardcoded hex values | hardcoded hex values (no shared tokens) |

No Zod on either frontend (plain TS interfaces). Both call the same FastAPI backend, which is the de-facto shared contract.

## 3. Parity matrix

Status ∈ **parity** / **partial** / **missing-on-mobile** / **mobile-only**. "parity" here is matrix-level (capability mapping confirmed); per-screen checklist verification (✅/⚠️/↔) happens in scoped runs.

### Auth & onboarding

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/sign-in`, `/(auth)/login` | `LoginScreen` | parity | Clerk email/password + OAuth |
| `/sign-up`, `/(auth)/register` | `RegisterScreen` | parity | member signup + email verification |
| `/owners/sign-up` | `RegisterScreen` + `OnboardingScreen` role selector | parity *(Run 13, 2026-06-11)* | role choice now happens at onboarding (member/owner selector); owner path posts `role: "owner"` then flows to `OrgOnboardingScreen` |
| `/auth/callback` | — | mobile-only-N/A | native Clerk OAuth; intentional divergence |
| `/dashboard` (role router) | `AppNavigator` role switch | parity | different mechanism, same outcome; intentional divergence |
| `/onboarding`, `/onboarding/member` | `OnboardingScreen` | parity *(Run 13)* | member/owner role selector; same profile payload as web incl. terms/privacy |
| `/onboarding/organization` (redirect) | `OrgOnboardingScreen` | parity *(fields aligned Run 13)* | display name, business email, required business phone, description added to match web payload |
| `/onboarding/owner` | `OnboardingScreen` (owner) → `OrgOnboardingScreen` | parity *(Run 13, 2026-06-11)* | two-step mobile flow matches web's combined form: owner profile (phone required) → org details; `AuthContext.refreshMe()` added so the navigator advances after each step |

### Marketplace / public

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/` (landing) | — | intentional divergence | app opens straight into Login/tabs |
| `/spaces` | `HomeScreen` (Marketplace tab) | parity *(Run 5, 2026-06-11)* | now uses web's `/api/marketplace/locations` with category tabs, q, date/time window, capacity, max price, sort, lat/lng+radius; location cards → `LocationSpaces`. ↔ intentional: no map view, manual lat/lng instead of Google Places autocomplete |
| `/spaces/[spaceId]` | `member/SpaceDetailScreen` | parity | full booking checkout: preview, promo codes, payment method, membership subscribe |
| `/locations/[locationId]` | `member/LocationSpacesScreen` | parity | `/api/locations/{id}/spaces` |
| `/meeting-rooms{,/[locationId]}` | `HomeScreen` "Meeting rooms" category | parity *(Run 5)* | same `category=meeting_room` query the web route uses |
| `/private-offices{,/[locationId]}` | `HomeScreen` "Private offices" category | parity *(Run 5)* | same `category=private_office` query the web route uses |
| `/booking-payment/[token]` | `BookingDetailScreen` pay flow + `components/BookingPaymentMethodSetup.tsx` | partial | web token link is a guest/anonymous checkout; mobile pays in-app as signed-in user. Open Q2 |
| `/guest/access-pass` | — | missing-on-mobile | guest flow — likely web-only by design. Open Q2 |
| `/privacy`, `/terms` | — | missing-on-mobile | likely link-out; Open Q2 |

### Member

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/member/access-passes` | `access/AccessPassesScreen` | parity | `/api/access-passes` |
| `/member/calendar` | `MemberCalendarScreen` | parity | **same endpoint both sides: `/api/me/calendar`** (verified) |
| `/member/directory` | `access/MemberDirectoryScreen` | parity | `/api/member/directory` with search/location/in-office filters |
| `/member/insights` | `member/MemberInsightsScreen` | parity *(Run 11, 2026-06-11)* | same `/api/analytics/me/summary`: KPI totals, favourite space, usual day/time, 12-week visit bars, upcoming list; member menu "Insights" |
| `/member/invoices` | `InvoicesScreen` | parity | list + open PDF |
| `/member/locations` | `member/LocationSpacesScreen` → `SpaceDetailScreen` | parity *(Run 12, 2026-06-11)* | *(corrected: this web page is a location-scoped quick-book page, not "my locations")* — mobile now shows the location header (`GET /api/locations/{id}`), per-space prices + hours; booking happens via `SpaceDetail`'s full checkout (↔ richer than web's inline quick-book form) |
| `/member/my-space-qr` | `access/MySpaceQrScreen` | parity | |
| `/member/payments` | `PaymentsScreen` | parity | `/api/payments` history |
| `/member/payments/success` | `PaymentSuccessScreen` | parity | |
| `/member/profile` | `ProfileScreen` | parity *(Run 1, 2026-06-11)* | profile edit (first/last/phone/company) via `PATCH /api/me` now on mobile; notification prefs + push enable live on `NotificationsScreen` (intentional divergence, linked from profile) |
| `/member/requests` | `BookingsScreen` | parity | `/api/booking-requests` |
| `/member/requests/[bookingId]` | `BookingDetailScreen` | parity | pay now / update card / retry payment |
| `/member/rewards` | `member/MemberRewardsScreen` | parity *(Run 10, 2026-06-11)* | Priddy Points wallet + per-org loyalty wallets (metrics, balances, tier note) + transactions ledger; member menu "Rewards" |
| `/member/spaces/[spaceId]` | `member/SpaceDetailScreen` | parity | shared with public detail |
| `/member/subscriptions` | `member/MemberSubscriptionsScreen` | parity *(Run 6, 2026-06-11)* | list + status stats + past-due banner + cancel-at-period-end (inline confirm); member menu "Memberships"; links to `SpaceDetail` and Payments |

### Owner

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/owner` (dashboard) | `owner/OwnerDashboardScreen` | parity *(Run 3, 2026-06-11)* | KPI parity: MTD revenue, occupancy, approved bookings, active memberships, today's bookings + original counts; error + empty states added. ↔ intentionally simplified: 30-day revenue chart and today timeline render as KPI counts, pending-request actions live on the Bookings tab |
| `/owner/access-scanner` | `access/AccessScannerScreen` | parity | camera scan + manual token + check-in/out |
| `/owner/account` | `ProfileScreen` | parity *(Run 17, 2026-06-11)* | same `GET/PATCH /api/me` editor as web incl. web's ≥7-digit phone validation; Clerk-hosted email/password modal has no `@clerk/expo` equivalent — ↔ intentional (managed on web) |
| `/owner/analytics` | `owner/OwnerAnalyticsScreen` | parity *(Run 23, 2026-06-11; reduced)* | all 8 overview KPIs with deltas, occupancy bars, revenue-per-space, top members, busiest hours from the same 5 analytics endpoints; date-range control. ↔ charts/heatmap visualizations + CSV/PDF exports web-only |
| `/owner/attendance` | `access/AttendanceScreen` | parity | filters: location/date/type/status/in-office |
| `/owner/bookings/new` | `owner/OwnerCreateBookingScreen` | parity | member search, preview, cash/link payment |
| `/owner/calendar` | `owner/OwnerCalendarScreen` | parity *(Run 9, 2026-06-11)* | same `/api/owner/calendar` query + org-location filter + member names + create-booking shortcut; booking/request events open `BookingDetail`. ↔ intentional: day view (like mobile member calendar) instead of web's timeline/week board |
| `/owner/invoices` | `InvoicesScreen` (shared) | partial | owner-side invoice creation parity unverified |
| `/owner/locations` | `owner/OwnerLocationsScreen` | parity | |
| `/owner/locations/new` | `owner/OwnerNewLocationScreen` | parity | |
| `/owner/locations/[id]/edit` | `owner/OwnerLocationEditScreen` | parity | |
| `/owner/locations/floor-plan` | — | missing-on-mobile | desktop-heavy editor; Open Q3 |
| `/owner/locations/spaces` | `owner/OwnerLocationRoomsScreen` | parity | |
| `/owner/loyalty` | `owner/OwnerLoyaltyScreen` | parity *(Run 24, 2026-06-11)* | program summary, full settings (toggles, numeric knobs, allowed space types/booking modes) via web's exact PUT projection, campaign builder + pause/activate, manual point grants; owner menu "Loyalty" |
| `/owner/marketing/*` (8 routes) | — | missing-on-mobile | campaign/segments/templates/workflows suite; Open Q3 |
| `/owner/members`, `/owner/members/[public_id]` | `owner/OwnerMembersScreen` + `owner/OwnerMemberDetailScreen` | parity *(Run 16, 2026-06-11)* | CRM list (`/api/owner/members` with org/search/status filters, counts, stats, tags) + detail (stats grid, editable status/phone/company/tags/notes via PATCH, upcoming/past activity from member-filtered `/api/owner/calendar`); owner menu "Members" |
| `/owner/payments` | `owner/OwnerPaymentsScreen` | parity *(Run 15, 2026-06-11)* | new owner payments overview: status stats, org-scoped payout ledger summary (`/api/owner/payout-summary`), rich ledger (member/space/when, fee/net/commission, failure reasons), invoice + follow-up links; owner menu and dashboard money cards now point here (members keep `PaymentsScreen`) |
| `/owner/payments/health` | `owner/OwnerPaymentHealthScreen` | parity *(Run 18, 2026-06-11)* | at-risk card dashboard: summary, status/window/location/search filters, single (forced) + bulk reminder emails via `/api/owner/payment-health/card-notices`; owner menu "Payment health". ↔ CSV export web-only |
| `/owner/requests` | `owner/OwnerBookingsScreen` | parity *(Runs 2+14, 2026-06-11)* | approve/reject + operator notes, status filter chips (all/pending/approved/payment-failed/rejected/cancelled), waitlist section with invite-to-book + notes (`/api/booking-waitlist/{id}/invite`), per-request email delivery summaries with resend for failed/bounced/not-sent (`/api/booking-requests/{id}/emails/resend`) |
| `/owner/settings` | `owner/OwnerSettingsScreen` | partial | mobile covers pricing rules, promo codes, waitlist, cancellation policies, Stripe connect; full web settings surface unverified |
| `/owner/settings/assistant-policies` | `owner/OwnerAssistantPoliciesScreen` | parity *(Run 19, 2026-06-11)* | policy form (scope org/location/space → record, 9 categories, title/body/source URL) + list with archive; same `/api/assistant/policies` endpoints; owner menu "Assistant policies" |
| `/owner/settings/payments` | `owner/OwnerPaymentSettingsScreen` | parity *(Run 4, 2026-06-11)* | new screen: marketplace readiness, Stripe/CardPointe credential form, test connection, enable/disable, org + location provider overrides — same endpoints as web; in owner menu as "Payment providers" |
| `/owner/spaces/new` | `owner/OwnerAddSpaceScreen` | parity | |
| `/owner/spaces/{edit,[spaceId]/edit}` | `owner/OwnerSpaceEditScreen` | parity *(Runs 7+20+21, 2026-06-11)* | core form + volume discounts + setup fees + lease/membership terms (plans CRUD with web's validations, type→booking-mode mapping, first-plan booking-mode enable, deactivate/reactivate) |
| `/owner/spaces/{media,[spaceId]/media}` | `owner/OwnerSpaceMediaScreen` | parity *(Run 8, 2026-06-11)* | photo gallery + presign upload flow (`/api/media/presign` → PUT → `/api/media`) with primary flag, sort order, 10 MB cap — same as web; uses `expo-image-picker` (approved) |
| `/owner/team` | `owner/OwnerTeamScreen` | parity | add member, role, pricing override, push toggles |

### Admin (platform)

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/admin/access-scanner` | `access/AccessScannerScreen` (AdminTabs) | parity | |
| `/admin/attendance` | `access/AttendanceScreen` (AdminTabs) | parity | |
| `/admin` + 15 other `/admin/*` routes (analytics, audit-logs, bookings, calendar, listings, members, owner-companies, owner-users, payments, platform-team, settings, users, assistant-quality) | — | missing-on-mobile | full platform console; Open Q4 (likely intentional desktop-only) |

### Mobile-only / cross-platform widgets

| Mobile screen | Web counterpart | Status | Notes |
|---|---|---|---|
| `MenuScreen` | sidebars (`components/side-nav.tsx` etc.) | intentional divergence | native nav hub |
| `AssistantScreen` | `components/assistant-mount.tsx` (global, in `app/layout.tsx`) | parity-ish | both gate on `/api/assistant/status`; UX differs by design |
| `NotificationsScreen` | notifications drawer in shell | parity-ish | mobile adds Expo push registration |

## 4. Cross-cutting findings (this run)

1. ~~**Confirmed real gap — owner request approval**~~ — **FIXED in Run 2** (see §6a); waitlist invite + email resend remain web-only.
2. ~~**Confirmed real gap — member profile editing**~~ — **FIXED in Run 1** (see §6a).
3. **No code sharing:** API clients, types, and availability math are duplicated (§2). Any parity work should consider extracting shared types or accept duplication knowingly.
4. ~~**No deep-link scheme**~~ — fixed Run 22: `priddyspaces://` scheme + linking config (`mobile/src/navigation/linking.ts`) for booking/notifications/invoices/memberships/owner payments/owner calendar.
5. ~~**No impersonation on mobile**~~ — fixed Run 22: `me.impersonation` context + amber banner with stop action (`mobile/src/components/ImpersonationBanner.tsx`); web's token-swap on stop is web-only (mobile re-fetches `/api/me`).
6. **Mobile gaps in state handling:** ~~`OwnerDashboardScreen` lacks error states~~ (fixed Run 3); `BookingDetailScreen` lacks empty state; auth screens surface errors via `Alert` only.

## 5. Open questions — DECIDED 2026-06-11

- **Q1 — Owner signup/onboarding on mobile:** **ADD TO MOBILE.** Owner role selection + owner/org onboarding flow goes into the backlog as its own proposed screen run (build spec required first).
- **Q2 — Guest & legal pages:** **WEB-ONLY / LINK OUT.** `/booking-payment/[token]`, `/guest/access-pass`, `/privacy`, `/terms` are intentional divergence; mobile links out where needed.
- **Q3 — Desktop-heavy owner suites:** **WANTED ON MOBILE.** `/owner/analytics`, `/owner/marketing/*`, `/owner/loyalty`, `/owner/locations/floor-plan` stay in backlog as missing-on-mobile; build specs proposed one at a time.
- **Q4 — Admin console:** **WANTED ON MOBILE.** The 16 `/admin/*` routes beyond Scanner/Attendance stay in backlog as missing-on-mobile; build specs proposed one at a time.
- **Q5 — Plan order:** **CONFIRMED** as proposed in §6.

### Proposed build specs — AWAITING GO (2026-06-11)

Per the workflow (propose → confirm → build, one screen per run). Confirm any subset; they will be built one at a time in this order.

**Spec 6 — `MemberSubscriptionsScreen`** *(DONE — Run 6)*
- Mirrors: `webUI/app/member/subscriptions/page.tsx` (165 lines).
- Data: `GET /api/subscriptions` (list + status summary counts: active/trialing/past_due/canceling/canceled).
- Actions: cancel membership at period end — `POST /api/subscriptions/{publicId}/cancel`. Web uses `window.confirm`; mobile will use the inline confirm pattern from Run 2.
- Nav: stack screen `MemberSubscriptions` + member menu entry "Memberships".
- Gating: signed-in member; server scopes to own subscriptions.
- Open questions: none.

**Spec 7 — `OwnerSpaceEditScreen`** *(DONE — Run 7; advanced managers staged)*
- Mirrors: `webUI/app/owner/spaces/[spaceId]/edit/client.tsx` (395 lines).
- Data: `GET /api/spaces/{spaceId}`; save via `PATCH /api/spaces/{spaceId}`.
- Reuses: form patterns + space-type/pricing rules from `mobile/src/screens/owner/OwnerAddSpaceScreen.tsx`.
- Nav: stack screen `OwnerSpaceEdit`, opened from per-space "Edit" buttons added to `OwnerLocationRoomsScreen` rows.
- Gating: owner; server-side location-role check.
- Open question: the web client is 395 lines — during the run I'll inventory which advanced sections it includes (booking modes / setup fees / volume discounts have their own backend routers) and either match them or stage them as an explicit follow-up; will not silently drop capabilities.

**Spec 8 — `OwnerSpaceMediaScreen`** *(DONE — Run 8)*
- Mirrors: `webUI/app/owner/spaces/[spaceId]/media/client.tsx` (231 lines).
- Data: `GET /api/spaces/{spaceId}/media`, `GET /api/spaces/{spaceId}`.
- Actions: upload via presigned flow (`POST /api/media/presign` → upload → `POST /api/media`), set primary, delete, reorder (whatever subset the web client exposes — verified in-run).
- Nav: stack screen `OwnerSpaceMedia`, opened from `OwnerSpaceEditScreen` (Spec 7) and/or `OwnerLocationRoomsScreen`.
- Gating: owner.
- **Open question (blocking): requires a new dependency `expo-image-picker` for photo selection. OK to add?**

**Spec 13 — Owner signup + onboarding on mobile** *(plan item 13 — AWAITING GO)*
- Mirrors: `webUI/app/onboarding/owner/page.tsx` (235 lines; the real flow — `/onboarding/personal` and `/onboarding/organization` are just web redirects, and `/owners/sign-up` is a thin Clerk wrapper).
- Web flow: `POST /api/onboarding/profile` with `role: "owner"` (full name, phone *required*, country, timezone, terms + privacy) → `POST /api/onboarding/organization` (`name`*, `display_name`, `website`, `business_email`, `business_phone`*, `description`) → route to owner dashboard.
- Mobile design (smallest diff — **no new screens needed**): `AppNavigator` already routes `role === "owner" && !has_organization` → `OrgOnboardingScreen`. Changes: (1) add a role selector to `OnboardingScreen` ("Join a workspace" = member / "List my workspace" = owner) replacing the `role: "member"` hardcode at `OnboardingScreen.tsx:45`, posting web's owner profile payload; (2) align `OrgOnboardingScreen` fields/payload with web's organization payload (add display_name, business_email, required business_phone, description); (3) ensure `me` refreshes after each POST so the navigator advances (verify `AuthContext` refresh path in-run).
- Gating: signed-in Clerk user without `role`; same backend endpoints enforce the rest.
- Open questions: none blocking.

**Spec 10 — `MemberRewardsScreen`** *(DONE — Run 10)*
- Mirrors: `webUI/app/member/rewards/page.tsx` (201 lines).
- Data: `GET /api/loyalty/priddy-wallet`, `GET /api/loyalty/priddy-wallet/transactions`, `GET /api/loyalty/wallets`, `GET /api/loyalty/wallets/{org}/transactions`.
- Nav: stack screen + member menu entry "Rewards".
- Open questions: none anticipated; read-only surface.

**Spec 11 — `MemberInsightsScreen`** *(DONE — Run 11)*
- Mirrors: `webUI/app/member/insights/page.tsx` (117 lines).
- Data: `GET /api/analytics/me/summary` (single endpoint).
- Nav: stack screen + member menu entry "Insights".
- Open questions: if web renders charts, mobile shows stat cards (same divergence policy as owner dashboard).

**Spec 12 — `MemberLocationsScreen`** *(DONE — Run 12, via enhanced `LocationSpacesScreen`)*
- Mirrors: `webUI/app/member/locations/page.tsx` (322 lines) — "my locations" derived from `GET /api/booking-requests` + `GET /api/locations/{id}` + `GET /api/locations/{id}/spaces`, with quick re-book (payment method resolve).
- Nav: stack screen + member menu entry "My locations"; space taps reuse `SpaceDetail`.
- Open questions: quick-rebook flow scope to be inventoried in-run (may stage like Run 7's managers).

**Spec 9 — `OwnerCalendarScreen`** *(DONE — Run 9)*
- Mirrors: `webUI/app/owner/calendar/page.tsx` (134 lines).
- Data: `GET /api/orgs`, `GET /api/locations?organization_public_id=`, `GET /api/owner/calendar?start&end&include=bookings,requests,subscriptions`.
- Reuses: day-navigation + location-filter + event-card patterns from `mobile/src/screens/MemberCalendarScreen.tsx`.
- Nav: stack screen `OwnerCalendar` + owner menu entry "Calendar" (OwnerTabs already has 6 tabs — a 7th would crowd the tab bar).
- Gating: owner.
- **Open question: menu entry (proposed) or 7th bottom tab — preference?**

## 6. Proposed plan (ordered, one screen per run)

Fix confirmed gaps in existing screens first (small diffs, high value), then propose missing screens:

1. ~~**Member profile**~~ — **DONE (Run 1, 2026-06-11)**, see §6a.
2. ~~**Owner request approval**~~ — **DONE (Run 2, 2026-06-11)**, see §6a. Follow-ups (waitlist invite, email resend) tracked in the matrix as partial.
3. ~~**Owner dashboard states + KPIs**~~ — **DONE (Run 3, 2026-06-11)**, see §6a.
4. ~~**Owner payments settings**~~ — **DONE (Run 4, 2026-06-11)**, see §6a. (Target corrected to `/owner/settings/payments`; `/owner/payments` payout summary remains a small partial gap.)
5. ~~**Marketplace filters**~~ — **DONE (Run 5, 2026-06-11)**, see §6a.
6. ~~**Member subscriptions**~~ — **DONE (Run 6, 2026-06-11)**, see §6a.
7. ~~**Owner space edit**~~ — **core form DONE (Run 7, 2026-06-11)**, see §6a; advanced managers (lease terms / volume discounts / setup fees) staged as follow-up.
8. ~~**Owner space media**~~ — **DONE (Run 8, 2026-06-11)**, see §6a.
9. ~~**Owner calendar**~~ — **DONE (Run 9, 2026-06-11)**, see §6a.
10. ~~**Member rewards**~~ — **DONE (Run 10, 2026-06-11)**, see changelog.
11. ~~**Member insights**~~ — **DONE (Run 11, 2026-06-11)**, see changelog.
12. ~~**Member locations**~~ — **DONE (Run 12, 2026-06-11)**, see changelog (reclassified: covered by enhanced `LocationSpacesScreen` + existing `SpaceDetail` flow).
13. ~~**Owner signup + onboarding on mobile**~~ — **DONE (Run 13, 2026-06-11)**, see changelog.
14. **Owner analytics / marketing / loyalty / floor-plan** — propose build specs one at a time. *(Q3: confirmed wanted)*
15. **Admin console screens** — propose build specs one at a time. *(Q4: confirmed wanted)*

## 6a. Per-screen findings

### Run 1 — `ProfileScreen` vs `/member/profile` (2026-06-11)

Checklist results after change (`mobile/src/screens/ProfileScreen.tsx`, mirrors `webUI/app/member/profile/page.tsx`):

- **Routing:** ✅ — Profile tab in all three role tab sets; unchanged.
- **Auth + tenancy:** ✅ — token from `AuthContext`; same `GET/PATCH /api/me` endpoints as web; works for member/owner/admin (web scopes this page to members, but `PATCH /api/me` is role-agnostic).
- **Data:** ✅ — loads `/api/me`, prefills first/last/phone/company; loading + error states added (was: none).
- **Actions:** ✅ — save profile (`PATCH /api/me`, same payload as web incl. `sanitizePhone` on input); log out retained. Notification prefs + push enable: ↔ intentional divergence — live on `NotificationsScreen`, now linked from profile ("Notification settings" button).
- **Feature flags/permissions:** ✅ — none on this surface (matches web).
- **Works:** ✅ — 6 new Jest tests in `mobile/__tests__/profile.test.tsx` (prefill, save payload, phone sanitization, load error, save error, nav/logout). Full mobile suite green (15 suites / 45 tests).

### Run 2 — `OwnerBookingsScreen` vs `/owner/requests` (2026-06-11)

Checklist results after change (`mobile/src/screens/owner/OwnerBookingsScreen.tsx`, mirrors `webUI/app/owner/requests/page.tsx`):

- **Routing:** ✅ — Bookings tab in `OwnerTabs`; unchanged. Card tap still opens `BookingDetail`.
- **Auth + tenancy:** ✅ — decisions authorized server-side via `require_location_roles(... OWNER, ADMIN, STAFF)` (`backend/app/api/booking_requests.py:1239`), same as web.
- **Data:** ✅ — same `GET /api/booking-requests`; list reloads after each decision; loading/empty/error states present; success feedback added.
- **Actions:** ✅ approve (direct, like web) and reject (confirm step, mirroring web's confirm modal) with optional `operator_notes` — same `POST /api/booking-requests/{id}/approve|reject` payloads. ⚠️ remaining web-only: waitlist invite, email resend, full status filters (tracked in matrix as partial). Retry-charge for `payment_failed` exists on `BookingDetailScreen` (unchanged).
- **Feature flags/permissions:** ✅ — decision buttons only on `status === "requested"`, matching web's `isPending` rule.
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/ownerRequestDecisions.test.tsx` (approve payload + reload, reject confirm flow, cancel confirm, API error surface, no buttons on `payment_failed`). Full mobile suite green (16 suites / 50 tests).

### Run 3 — `OwnerDashboardScreen` vs `/owner` (2026-06-11)

Checklist results after change (`mobile/src/screens/owner/OwnerDashboardScreen.tsx`, mirrors `webUI/app/owner/page.tsx`):

- **Routing:** ✅ — Dashboard tab in `OwnerTabs`; unchanged. New cards navigate to Payments/Locations/Bookings; empty state navigates to `OwnerNewLocation`.
- **Auth + tenancy:** ✅ — same endpoints as web incl. `/api/owner/calendar` (today window) and `/api/locations?organization_public_id=` scoping.
- **Data:** ✅ — same queries and the same KPI math as web (`paymentAmount`/`paymentRefundedAmount` cents-aware, MTD = succeeded − refunds this month, occupancy = non-available/total spaces, active memberships = active/trialing/past_due/canceling). Loading/error/empty states all present (error + empty were missing).
- **Actions:** ✅ — stat-card navigation; pending-request approve/reject reachable one tap away on the Bookings tab (web shows an inline preview — ↔ intentional divergence).
- **Feature flags/permissions:** ✅ — none on this surface.
- **Works:** ✅ — rewrote `mobile/__tests__/owner-dashboard.test.tsx` (4 tests: KPI math vs fixtures, card navigation, empty state CTA, load-error surface). Full mobile suite green (16 suites / 53 tests).
- ⚠️ Fixed along the way: payment volume previously summed raw `payment.amount` (ignored `amount_cents` and payment status) — now matches web's gross (succeeded, cents-aware).
- ↔ Deferred visualizations (not gaps): 30-day revenue chart, today timeline (no chart lib on mobile; data surfaced as KPIs).

### Run 4 — `OwnerPaymentSettingsScreen` vs `/owner/settings/payments` (2026-06-11)

Checklist results (new screen `mobile/src/screens/owner/OwnerPaymentSettingsScreen.tsx`, mirrors `webUI/app/owner/settings/payments/page.tsx`):

- **Routing:** ✅ — registered as `OwnerPaymentSettings` in the main stack (`AppNavigator.tsx`); owner menu entry "Payment providers" in `MenuScreen`.
- **Auth + tenancy:** ✅ — org-scoped via `?organization_public_id=`; same endpoints as web (`/api/owner/payment-settings*`, `/api/owner/marketplace-readiness`, `/api/owner/payment-provider/{organization,location}/{id}`).
- **Data:** ✅ — marketplace readiness card (status text identical to web), configured-providers list, form prefill from selected provider incl. "saved" placeholders for write-only secrets; loading/error/empty (no providers) states present.
- **Actions:** ✅ — save credentials (same payload as web), test connection, enable/disable, org provider override, location provider override. Secrets use `secureTextEntry`.
- **Feature flags/permissions:** ✅ — authorization enforced server-side as on web.
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/ownerPaymentSettings.test.tsx` (load/prefill/readiness, save payload, disable+test, overrides payloads, CardPointe switch + load error). Full suite green (17 suites / 58 tests).
- Matrix correction made during this run: web `/owner/payments` is a payments *overview* (payments, invoices, payout summary), not provider settings — matrix updated; payout summary remains a small partial gap.

### Run 5 — `HomeScreen` vs `/spaces` (+ `/meeting-rooms`, `/private-offices`) (2026-06-11)

Checklist results after change (`mobile/src/screens/HomeScreen.tsx`, mirrors `webUI/components/public-marketplace-browser.tsx` + `webUI/lib/public-marketplace.ts`):

- **Routing:** ✅ — Marketplace tab root; location cards navigate to existing `LocationSpaces` (→ `SpaceDetail`), mirroring web's location-grouped results.
- **Auth + tenancy:** ✅ — endpoint is public on backend; mobile passes its token when present.
- **Data:** ✅ — switched from flat `/api/marketplace/search` to web's `/api/marketplace/locations`; renders matching-space count, distance, starting day-pass/hourly/monthly prices, amenities; loading/empty/error states present; auto-loads on mount and category switch like web.
- **Actions:** ✅ — category tabs (coworking/private offices/meeting rooms — covers the `/meeting-rooms` and `/private-offices` web routes), q, date + start/end time availability window, capacity, max price (label varies by category like web), sort (default/relevance/distance/price asc/desc/name), lat/lng + radius_miles with web's q-drop rule.
- **Feature flags/permissions:** ✅ — none (public surface).
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/marketplace.test.tsx` (auto-load + card render + nav, category re-query, full filter param parity, lat/lng q-drop rule, error/empty state). Full suite green (18 suites / 63 tests).
- ↔ Intentional divergence: no embedded map view; manual lat/lng/radius fields instead of Google Places autocomplete (no geocoding dependency on mobile).

### Run 6 — `MemberSubscriptionsScreen` vs `/member/subscriptions` (2026-06-11)

Checklist results (new screen `mobile/src/screens/member/MemberSubscriptionsScreen.tsx`, mirrors `webUI/app/member/subscriptions/page.tsx`; specs 6–9 confirmed by user, `expo-image-picker` approved, owner calendar as menu entry):

- **Routing:** ✅ — stack route `MemberSubscriptions`; member menu entry "Memberships"; links out to `SpaceDetail` (nested Marketplace stack) and `Payments`.
- **Auth + tenancy:** ✅ — `GET /api/subscriptions` scoped server-side to the signed-in member, same as web.
- **Data:** ✅ — list + Active/Past Due/Canceling stats + past-due banner; loading/error/empty (browse CTA) states present.
- **Actions:** ✅ — cancel at period end (`POST /api/subscriptions/{id}/cancel`) behind inline confirm (web uses `window.confirm` — ↔ native pattern); cancel hidden for canceled/canceling like web; success message matches web copy.
- **Feature flags/permissions:** ✅ — none.
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/memberSubscriptions.test.tsx`. Full suite green (19 suites / 68 tests).

### Run 7 — `OwnerSpaceEditScreen` vs `/owner/spaces/[spaceId]/edit` (2026-06-11)

Checklist results (new screen `mobile/src/screens/owner/OwnerSpaceEditScreen.tsx`, mirrors `webUI/app/owner/spaces/[spaceId]/edit/client.tsx`):

- **Routing:** ✅ — stack route `OwnerSpaceEdit` (`{spaceId, name}`); entry from per-space "Edit space" buttons on `OwnerLocationRoomsScreen`.
- **Auth + tenancy:** ✅ — same `GET/PATCH /api/spaces/{id}` as web; location-role authorization server-side.
- **Data:** ✅ — prefill of all editable fields; loading/error states; type-dependent field visibility identical to web's `typeConfig` (hourly+daily+hours+buffers for conference rooms, daily+hours for shared desks, none for offices/suites/virtual).
- **Actions:** ✅ — save with web's exact PATCH payload incl. `price_monthly: null` always (web edit never exposes monthly), capacity forced to 1 for virtual offices, required-price validation disabling save.
- **Feature flags/permissions:** ✅ — none beyond server checks.
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/ownerSpaceEdit.test.tsx` (prefill + payload, required-price gating, type-switch field dropping, load error, rooms-screen entry point). Full suite green (20 suites / 73 tests).
- ⚠️ Staged follow-up (web has, mobile not yet): LeaseTermsManager (non-conference types), VolumeDiscountManager (conference/shared desk), SetupFeeManager — each is a self-contained web component with its own endpoints; tracked in matrix as partial.

### Run 8 — `OwnerSpaceMediaScreen` vs `/owner/spaces/[spaceId]/media` (2026-06-11)

Checklist results (new screen `mobile/src/screens/owner/OwnerSpaceMediaScreen.tsx`, mirrors `webUI/app/owner/spaces/[spaceId]/media/client.tsx`):

- **Routing:** ✅ — stack route `OwnerSpaceMedia` (`{spaceId, name}`); entry from per-space "Photos" buttons on `OwnerLocationRoomsScreen`.
- **Auth + tenancy:** ✅ — same endpoints as web: `GET /api/spaces/{id}` + `GET /api/spaces/{id}/media`, presign via `POST /api/media/presign` (server validates space ownership), storage PUT, register via `POST /api/media`.
- **Data:** ✅ — gallery with sort order + primary badge; first-image defaults (`is_primary` true when empty, sort order = count) match web; loading/error/empty states present.
- **Actions:** ✅ — pick from photo library (`expo-image-picker`, permission-gated), primary toggle, sort order, upload with web's 10 MB cap and exact payloads. Web exposes no delete/reorder actions — none added (parity).
- **Feature flags/permissions:** ✅ — OS photo permission handled; `NSPhotoLibraryUsageDescription` + `READ_MEDIA_IMAGES` added to `mobile/app.json`.
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/ownerSpaceMedia.test.tsx` (gallery render, full presign upload flow with payload checks, permission denial, 10 MB rejection, rooms entry point). Full suite green (21 suites / 78 tests).
- Dependency added: `expo-image-picker@~17.0.11` (user-approved); lockfile regenerated with npm 10 for CI compatibility.

### Run 9 — `OwnerCalendarScreen` vs `/owner/calendar` (2026-06-11)

Checklist results (new screen `mobile/src/screens/owner/OwnerCalendarScreen.tsx`, mirrors `webUI/app/owner/calendar/page.tsx`; nav placement per user decision: owner menu entry, not a 7th tab):

- **Routing:** ✅ — stack route `OwnerCalendar`; owner menu entry "Calendar"; booking/request events open `BookingDetail`; "Create booking" → `OwnerCreateBooking` (mirrors web's header CTA).
- **Auth + tenancy:** ✅ — same `/api/owner/calendar?start&end&location_public_id` query; locations preloaded from `/api/orgs` → `/api/locations?organization_public_id=` with web's sole-location auto-select.
- **Data:** ✅ — events with member names, plan badges, payment status, timezone-correct times; loading/error/empty states present.
- **Actions:** ✅ — day prev/today/next, location filter chips, event open, create booking. Web's space-type/space/status/member-search filters: ↔ simplified to location filter, matching the existing mobile member-calendar pattern; web's timeline/week board → day list (intentional mobile pattern).
- **Feature flags/permissions:** ✅ — server-side owner scoping.
- **Works:** ✅ — 5 new Jest tests in `mobile/__tests__/ownerCalendar.test.tsx` (events render incl. member/plan, location filter param, booking-vs-subscription tap behavior, create-booking nav, load error). Full suite green (22 suites / 83 tests).

## 7. Changelog

- **2026-06-11 — Run 24: owner loyalty.** New `OwnerLoyaltyScreen` mirroring `webUI/app/owner/loyalty/page.tsx`: per-org summary stats (issued/redeemed/outstanding/liability), the full settings surface (three toggles, seven numeric knobs, allowed space-type and booking-mode chip lists) saved with web's exact 12-field PUT projection, campaign builder (six types, promo/earned reward, draft/active, budget) with web's POST payload incl. `reward_json`/`rules_json`, campaign pause/activate, and manual point grants. 4 new tests (33 suites / 131 tests green). Checklist: all ✅.

- **2026-06-11 — Run 23: owner analytics (reduced).** New `OwnerAnalyticsScreen` (owner menu "Analytics") on the same endpoints as `webUI/app/owner/analytics/page.tsx`: overview KPIs incl. revenue/booking deltas and the locations•spaces sub-line, occupancy-by-day bar rows, revenue-per-space list, top members, and top-5 busiest hours derived from the peak-hours matrix; start/end date range with web's defaults. ↔ chart/heatmap visualizations and CSV/PDF exports stay web-only per the visualization policy. 3 new tests (32 suites / 127 tests green). Checklist: all ✅.

- **2026-06-11 — Run 22: deep links + impersonation banner.** Added the `priddyspaces://` URL scheme to `app.json` and a navigation `linking` config (`booking/:bookingId`, notifications, invoices, memberships, owner payments/calendar). Added `me.impersonation` to `AuthContext` and an amber `ImpersonationBanner` above the main stack mirroring web's banner copy, with Stop → `POST /api/admin/impersonation/stop` + `refreshMe()` (web's access-token swap is web-only — ↔). 3 new tests (31 suites / 124 tests green). Both Step 0 cross-cutting gaps closed.

- **2026-06-11 — Run 21: lease terms manager.** `OwnerSpaceEditScreen` gained web's `LeaseTermsManager` capabilities for non-conference types: membership-plan list filtered by the space-type→booking-mode mapping, create/edit form (term months, monthly price, default plan names, seats, max subscriptions) with web's validations and payloads, first-plan `PUT /api/spaces/{id}/booking-modes` enable, and deactivate/reactivate via DELETE/PATCH. 1 new test (30 suites / 121 tests green). `/owner/spaces/.../edit` now fully at parity — the Run 7 staged set is complete.

- **2026-06-11 — Run 20: space volume discounts + setup fees.** `OwnerSpaceEditScreen` gained the two smaller advanced managers staged in Run 7, with web's exact gating (volume discounts only for conference rooms/shared desks; setup fees for all types) and payload rules (tier filter `min_hours>0 && 0<discount<100`; fee filter label+cents>0, cents rounding, inactive fees hidden on load). 1 comprehensive test added (30 suites / 120 tests green). Lease-terms manager (membership plans CRUD) split into its own run.

- **2026-06-11 — Run 19: assistant policies.** New `OwnerAssistantPoliciesScreen` mirroring `webUI/app/owner/settings/assistant-policies/page.tsx`: scope-type chips driving record options (orgs/locations/spaces preloaded like web), the 9 category chips, title/body/source-URL form posting web's exact payload, policy list with scope•category header and archive (`DELETE /api/assistant/policies/{id}`, archived rows dimmed). 4 new tests (30 suites / 119 tests green). Checklist: all ✅.

- **2026-06-11 — Run 18: owner payment health.** New `OwnerPaymentHealthScreen` mirroring `webUI/app/owner/payments/health/page.tsx`: summary cards (expired/expiring/missing-expiry/upcoming value/recent volume), web's default filters (`status=at_risk`, `window_days=30`) with status/window/location chips + search, card rows with member/card/expiry/risk counts/money/last-notice, per-card forced reminder and bulk select+send via `POST /api/owner/payment-health/card-notices` with web's exact payload and result message. ↔ CSV export stays web-only. 5 new tests (29 suites / 115 tests green). Checklist: all ✅.

- **2026-06-11 — Run 17: owner account.** Web `/owner/account` is a profile editor over the same `GET/PATCH /api/me` that `ProfileScreen` (Run 1) already implements for all roles. Closed the one real delta: web's phone validation (≥7 digits) now enforced before save. Web's security section opens Clerk's hosted user-profile modal, which `@clerk/expo` does not provide — recorded as ↔ intentional divergence. 1 new test (28 suites / 110 tests green). Checklist: all ✅.

- **2026-06-11 — Run 16: owner members CRM.** New `OwnerMembersScreen` (org chips, search, status chips with counts, member cards with bookings/revenue/tags) and `OwnerMemberDetailScreen` (stats grid; editable status/phone/company/tags/notes via the same `PATCH /api/owner/members/{id}?organization_public_id=` payload as web; upcoming/past activity from member-filtered `/api/owner/calendar`, rows opening `BookingDetail`). Owner menu gains "Members" (distinct from "Team" = staff). Matrix corrected: the earlier overlap guess with `OwnerTeamScreen` was wrong — web members CRM uses `/api/owner/members`, not org-member endpoints. 5 new tests (28 suites / 109 tests green). Checklist: all ✅.

- **2026-06-11 — Run 15: owner payments overview.** New `OwnerPaymentsScreen` mirroring `webUI/app/owner/payments/page.tsx`: succeeded/failed/requires-payment counts + processed volume, payout ledger summary per organization (gross/tax/refunded/platform fees/owner net + entry counts via `/api/owner/payout-summary?organization_public_id=`), and the full payment ledger with member/space/when context, cents-aware amounts, fee/net/commission, failure reasons, invoice links (→ `Invoices`), and failed-payment follow-up links (→ Bookings / OwnerSettings, mirroring web's links). Owner menu "Payments" and dashboard money cards now open it; members keep `PaymentsScreen`. 3 new tests (27 suites / 104 tests green). Checklist: all ✅; web's inline invoice PDF download routes through the existing `Invoices` screen (↔ navigation pattern).

- **2026-06-11 — Run 14: owner requests completion.** `OwnerBookingsScreen` now matches web's full inbox: status filter chips with web's empty-state copy, full request history (was: pending+failed only), waitlist section (member/space/desired-start, invite-to-book with operator notes, closed state), and per-request email delivery summaries (label, recipients, status, last error) with resend gated to failed/bounced/not-sent like web's `canResendEmail`. 3 new tests (26 suites / 101 tests green). Checklist: all ✅; guest-contact block deferred with the web-only guest checkout decision (Q2).

- **2026-06-11 — Run 13: owner signup + onboarding.** `OnboardingScreen` gained a member/owner role selector (replacing the `role: "member"` hardcode), owner-required phone, and adaptive copy; `OrgOnboardingScreen` payload aligned with web (`display_name`, `business_email`, required `business_phone`, `description`; `industry` kept — backend accepts it). Added `AuthContext.refreshMe()` and call it after both onboarding POSTs — previously **nothing** re-fetched `/api/me` after onboarding, so the navigator could not advance (latent bug fixed for the member flow too). 4 new tests in `mobile/__tests__/onboarding.test.tsx` (26 suites / 98 tests green). Checklist: all ✅; web's single combined owner form is two mobile steps (↔ native pattern, navigator-driven).

- **2026-06-11 — Run 12: member locations.** Discovery correction: web `/member/locations` (`webUI/app/member/locations/page.tsx`) is a location-scoped quick-book page (`?locationId=`), not a "my locations" list. Mobile already covered the booking capability via `LocationSpacesScreen` → `SpaceDetailScreen` (full checkout incl. payment resolve + consent — richer than web's inline form, ↔ intentional). Closed the remaining info gaps in `LocationSpacesScreen`: location header with address/city (`GET /api/locations/{id}`, graceful fallback to route-param name), per-space prices (day/month) and availability hours, capacity+status line matching web. 4 new tests in `mobile/__tests__/memberLocationSpaces.test.tsx` (25 suites / 94 tests green). Checklist: all ✅.
- **2026-06-11 — Run 11: member insights.** New `MemberInsightsScreen` (member menu "Insights") mirroring `webUI/app/member/insights/page.tsx` on the same `/api/analytics/me/summary` endpoint: KPI cards (visits, hours, spent, upcoming/past), favourite space, usual day/time, 12-week visit series as native bar rows, upcoming bookings list. Loading/error/empty states; 3 new tests (24 suites / 90 tests green). Checklist: all ✅; web's chart component rendered as lightweight bar rows (↔ visualization simplification).
- **2026-06-11 — Run 10: member rewards.** New `MemberRewardsScreen` (member menu "Rewards") mirroring `webUI/app/member/rewards/page.tsx`: Priddy Points wallet with recent platform transactions, per-org wallet selector chips, metrics (available/cash value/tier/expiring), balance grid, tier-progress note, and the full rewards ledger with +/- point styling — same four loyalty endpoints and formatters as web. Loading/error/empty states; 4 new tests in `mobile/__tests__/memberRewards.test.tsx` (23 suites / 87 tests green). Checklist: routing ✅ auth ✅ data ✅ actions ✅ (read-only like web) flags ✅ works ✅; tier-progress bar rendered as text note (↔ visualization simplification).
- **2026-06-11 — Run 9: owner calendar.** New `OwnerCalendarScreen` (owner menu "Calendar"): day view of `/api/owner/calendar` with org-location filter, member names, event → BookingDetail, create-booking shortcut. 5 new tests.
- **2026-06-11 — Run 8: owner space media.** New `OwnerSpaceMediaScreen` with photo-library picking and web's presign upload flow; "Photos" entry on room cards; photo permissions added to app.json; `expo-image-picker` dependency added. 5 new tests.
- **2026-06-11 — Run 7: owner space edit (core form).** New `OwnerSpaceEditScreen` + "Edit space" entry on `OwnerLocationRoomsScreen`. Web-parity PATCH payload and type-dependent form rules. Advanced managers staged. 5 new tests.
- **2026-06-11 — Run 6: member subscriptions.** New `MemberSubscriptionsScreen` (stack route + member menu "Memberships"): list, status stats, past-due banner → Payments, cancel-at-period-end with inline confirm, links to membership space. 5 new tests.
- **2026-06-11 — Build specs proposed.** Specs 6–9 (member subscriptions, owner space edit, owner space media, owner calendar) written to §5 with real citations; awaiting go. Two blocking questions: `expo-image-picker` dependency for media uploads; owner calendar as menu entry vs 7th tab.
- **2026-06-11 — Run 5: marketplace browser parity.** `HomeScreen` rewritten onto web's `/api/marketplace/locations` with category tabs, q/date/time/capacity/price/sort/geo filters (web's exact param rules incl. q-drop with lat/lng), location-grouped result cards with starting prices feeding the existing `LocationSpaces` → `SpaceDetail` flow. 5 new tests.
- **2026-06-11 — Run 4: owner payment provider settings.** New `OwnerPaymentSettingsScreen` (stack route `OwnerPaymentSettings`, owner menu "Payment providers") mirroring web's `/owner/settings/payments`: readiness card, Stripe/CardPointe credential forms with write-only secret placeholders, test connection, enable/disable, org/location provider overrides. 5 new tests. Matrix corrected re `/owner/payments` (overview page, not provider settings).
- **2026-06-11 — Run 3: owner dashboard parity.** `OwnerDashboardScreen` now computes web's KPIs (MTD revenue, occupancy, approved bookings, active memberships, today's bookings via `/api/owner/calendar`) with web's exact money math, and gained error + empty (no-locations → create CTA) states. Payment-volume math fixed to be cents-aware and succeeded-only. Tests rewritten (4 tests).
- **2026-06-11 — Run 2: owner request decisions.** Added approve/reject with operator notes to `mobile/src/screens/owner/OwnerBookingsScreen.tsx` (`POST /api/booking-requests/{id}/approve|reject`, reject behind an inline confirm step, list reload + success/error feedback). Added `mobile/__tests__/ownerRequestDecisions.test.tsx` (5 tests). Also this date: fixed repo-wide `mobile-security` CI failures via npm overrides for joi (GHSA-q7cg-457f-vx79) and shell-quote (GHSA-w7jw-789q-3m8p) in PR #185.
- **2026-06-11 — Run 1: member profile parity.** Rewrote `mobile/src/screens/ProfileScreen.tsx` from static (email/role/logout) to full profile editor matching `webUI/app/member/profile/page.tsx`: `GET /api/me` prefill, `PATCH /api/me` save (first/last/phone/company, phone sanitized), loading/error/success states, link to `NotificationsScreen` for prefs (intentional divergence), logout retained. Added `mobile/__tests__/profile.test.tsx` (6 tests). Decisions recorded for Q1–Q5 (§5).
- **2026-06-11 — Step 0 discovery run.** Created this audit. Enumerated 97 web routes and 32 mobile screens; built parity matrix; verified calendar endpoint parity (`/api/me/calendar` both sides), owner approve/deny gap, member profile gap, `role: "member"` hardcode in mobile onboarding, absence of code sharing and deep-link scheme. **No code changed.**

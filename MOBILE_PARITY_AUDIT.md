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
| `/owners/sign-up` | — | missing-on-mobile | mobile `OnboardingScreen.tsx:45` hardcodes `role: "member"` — owners cannot sign up on mobile. Open Q1 |
| `/auth/callback` | — | mobile-only-N/A | native Clerk OAuth; intentional divergence |
| `/dashboard` (role router) | `AppNavigator` role switch | parity | different mechanism, same outcome; intentional divergence |
| `/onboarding`, `/onboarding/member` | `OnboardingScreen` | partial | web flow has extra steps; see Q1 |
| `/onboarding/organization` | `OrgOnboardingScreen` | parity | |
| `/onboarding/owner`, `/onboarding/personal` | — | missing-on-mobile | tied to Q1 (owner signup path) |

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
| `/member/insights` | — | missing-on-mobile | proposal needed |
| `/member/invoices` | `InvoicesScreen` | parity | list + open PDF |
| `/member/locations` | — | missing-on-mobile | `HomeScreen` search overlaps but isn't "my locations" |
| `/member/my-space-qr` | `access/MySpaceQrScreen` | parity | |
| `/member/payments` | `PaymentsScreen` | parity | `/api/payments` history |
| `/member/payments/success` | `PaymentSuccessScreen` | parity | |
| `/member/profile` | `ProfileScreen` | parity *(Run 1, 2026-06-11)* | profile edit (first/last/phone/company) via `PATCH /api/me` now on mobile; notification prefs + push enable live on `NotificationsScreen` (intentional divergence, linked from profile) |
| `/member/requests` | `BookingsScreen` | parity | `/api/booking-requests` |
| `/member/requests/[bookingId]` | `BookingDetailScreen` | parity | pay now / update card / retry payment |
| `/member/rewards` | — | missing-on-mobile | loyalty wallet/ledger; proposal needed |
| `/member/spaces/[spaceId]` | `member/SpaceDetailScreen` | parity | shared with public detail |
| `/member/subscriptions` | `member/MemberSubscriptionsScreen` | parity *(Run 6, 2026-06-11)* | list + status stats + past-due banner + cancel-at-period-end (inline confirm); member menu "Memberships"; links to `SpaceDetail` and Payments |

### Owner

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/owner` (dashboard) | `owner/OwnerDashboardScreen` | parity *(Run 3, 2026-06-11)* | KPI parity: MTD revenue, occupancy, approved bookings, active memberships, today's bookings + original counts; error + empty states added. ↔ intentionally simplified: 30-day revenue chart and today timeline render as KPI counts, pending-request actions live on the Bookings tab |
| `/owner/access-scanner` | `access/AccessScannerScreen` | parity | camera scan + manual token + check-in/out |
| `/owner/account` | — | missing-on-mobile | |
| `/owner/analytics` | — | missing-on-mobile | desktop-heavy; Open Q3 |
| `/owner/attendance` | `access/AttendanceScreen` | parity | filters: location/date/type/status/in-office |
| `/owner/bookings/new` | `owner/OwnerCreateBookingScreen` | parity | member search, preview, cash/link payment |
| `/owner/calendar` | — | missing-on-mobile | `MemberCalendarScreen` is member-scoped; owners have no calendar on mobile |
| `/owner/invoices` | `InvoicesScreen` (shared) | partial | owner-side invoice creation parity unverified |
| `/owner/locations` | `owner/OwnerLocationsScreen` | parity | |
| `/owner/locations/new` | `owner/OwnerNewLocationScreen` | parity | |
| `/owner/locations/[id]/edit` | `owner/OwnerLocationEditScreen` | parity | |
| `/owner/locations/floor-plan` | — | missing-on-mobile | desktop-heavy editor; Open Q3 |
| `/owner/locations/spaces` | `owner/OwnerLocationRoomsScreen` | parity | |
| `/owner/loyalty` | — | missing-on-mobile | Open Q3 |
| `/owner/marketing/*` (8 routes) | — | missing-on-mobile | campaign/segments/templates/workflows suite; Open Q3 |
| `/owner/members`, `/owner/members/[public_id]` | — (overlaps `OwnerTeamScreen`) | partial | both web pages and mobile `OwnerTeamScreen` hit `/api/orgs/{orgId}/members`; exact split members-vs-team needs per-screen verification |
| `/owner/payments` | `PaymentsScreen` + `InvoicesScreen` | partial | *(corrected Run 4: this web page is a payments **overview** — payments list, invoices, payout summary, not provider settings)*; mobile covers payments + invoices; payout summary (`/api/owner/payouts` area) missing |
| `/owner/payments/health` | — | missing-on-mobile | |
| `/owner/requests` | `owner/OwnerBookingsScreen` | partial *(approve/reject added Run 2, 2026-06-11)* | approve/reject with operator notes now on mobile (`POST /api/booking-requests/{id}/approve\|reject`); still web-only: waitlist invite (`/api/booking-waitlist/{id}/invite`), email resend (`/api/booking-requests/{id}/emails/resend`), status filters/history view |
| `/owner/settings` | `owner/OwnerSettingsScreen` | partial | mobile covers pricing rules, promo codes, waitlist, cancellation policies, Stripe connect; full web settings surface unverified |
| `/owner/settings/assistant-policies` | — | missing-on-mobile | |
| `/owner/settings/payments` | `owner/OwnerPaymentSettingsScreen` | parity *(Run 4, 2026-06-11)* | new screen: marketplace readiness, Stripe/CardPointe credential form, test connection, enable/disable, org + location provider overrides — same endpoints as web; in owner menu as "Payment providers" |
| `/owner/spaces/new` | `owner/OwnerAddSpaceScreen` | parity | |
| `/owner/spaces/{edit,[spaceId]/edit}` | `owner/OwnerSpaceEditScreen` | partial *(core form Run 7, 2026-06-11)* | core edit form at parity (typed pricing rules, availability status/hours, buffers, visibility — same PATCH payload as web). ⚠️ staged follow-up: web's advanced managers (lease terms, volume discounts, setup fees — `webUI/components/{lease-terms,volume-discount,setup-fee}-manager.tsx`) not yet on mobile |
| `/owner/spaces/{media,[spaceId]/media}` | — | missing-on-mobile | no media management on mobile |
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
4. **No deep-link scheme** in `mobile/app.json`; only push-tap → BookingDetail routing exists.
5. **No impersonation on mobile** (web layouts support admin impersonation).
6. **Mobile gaps in state handling:** ~~`OwnerDashboardScreen` lacks error states~~ (fixed Run 3); `BookingDetailScreen` lacks empty state; auth screens surface errors via `Alert` only.

## 5. Open questions — DECIDED 2026-06-11

- **Q1 — Owner signup/onboarding on mobile:** **ADD TO MOBILE.** Owner role selection + owner/org onboarding flow goes into the backlog as its own proposed screen run (build spec required first).
- **Q2 — Guest & legal pages:** **WEB-ONLY / LINK OUT.** `/booking-payment/[token]`, `/guest/access-pass`, `/privacy`, `/terms` are intentional divergence; mobile links out where needed.
- **Q3 — Desktop-heavy owner suites:** **WANTED ON MOBILE.** `/owner/analytics`, `/owner/marketing/*`, `/owner/loyalty`, `/owner/locations/floor-plan` stay in backlog as missing-on-mobile; build specs proposed one at a time.
- **Q4 — Admin console:** **WANTED ON MOBILE.** The 16 `/admin/*` routes beyond Scanner/Attendance stay in backlog as missing-on-mobile; build specs proposed one at a time.
- **Q5 — Plan order:** **CONFIRMED** as proposed in §6.

### Proposed build specs — AWAITING GO (2026-06-11)

Per the workflow (propose → confirm → build, one screen per run). Confirm any subset; they will be built one at a time in this order.

**Spec 6 — `MemberSubscriptionsScreen`** *(plan item 6)*
- Mirrors: `webUI/app/member/subscriptions/page.tsx` (165 lines).
- Data: `GET /api/subscriptions` (list + status summary counts: active/trialing/past_due/canceling/canceled).
- Actions: cancel membership at period end — `POST /api/subscriptions/{publicId}/cancel`. Web uses `window.confirm`; mobile will use the inline confirm pattern from Run 2.
- Nav: stack screen `MemberSubscriptions` + member menu entry "Memberships".
- Gating: signed-in member; server scopes to own subscriptions.
- Open questions: none.

**Spec 7 — `OwnerSpaceEditScreen`** *(plan item 7)*
- Mirrors: `webUI/app/owner/spaces/[spaceId]/edit/client.tsx` (395 lines).
- Data: `GET /api/spaces/{spaceId}`; save via `PATCH /api/spaces/{spaceId}`.
- Reuses: form patterns + space-type/pricing rules from `mobile/src/screens/owner/OwnerAddSpaceScreen.tsx`.
- Nav: stack screen `OwnerSpaceEdit`, opened from per-space "Edit" buttons added to `OwnerLocationRoomsScreen` rows.
- Gating: owner; server-side location-role check.
- Open question: the web client is 395 lines — during the run I'll inventory which advanced sections it includes (booking modes / setup fees / volume discounts have their own backend routers) and either match them or stage them as an explicit follow-up; will not silently drop capabilities.

**Spec 8 — `OwnerSpaceMediaScreen`** *(plan item 8)*
- Mirrors: `webUI/app/owner/spaces/[spaceId]/media/client.tsx` (231 lines).
- Data: `GET /api/spaces/{spaceId}/media`, `GET /api/spaces/{spaceId}`.
- Actions: upload via presigned flow (`POST /api/media/presign` → upload → `POST /api/media`), set primary, delete, reorder (whatever subset the web client exposes — verified in-run).
- Nav: stack screen `OwnerSpaceMedia`, opened from `OwnerSpaceEditScreen` (Spec 7) and/or `OwnerLocationRoomsScreen`.
- Gating: owner.
- **Open question (blocking): requires a new dependency `expo-image-picker` for photo selection. OK to add?**

**Spec 9 — `OwnerCalendarScreen`** *(plan item 9)*
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
8. **Owner space media** — propose build spec. *(missing)*
9. **Owner calendar** — propose build spec. *(missing)*
10. **Member rewards** — propose build spec. *(missing)*
11. **Member insights** — propose build spec. *(missing)*
12. **Member locations** — propose build spec. *(missing)*
13. **Owner signup + onboarding on mobile** — propose build spec. *(Q1: confirmed wanted)*
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

## 7. Changelog

- **2026-06-11 — Run 7: owner space edit (core form).** New `OwnerSpaceEditScreen` + "Edit space" entry on `OwnerLocationRoomsScreen`. Web-parity PATCH payload and type-dependent form rules. Advanced managers staged. 5 new tests.
- **2026-06-11 — Run 6: member subscriptions.** New `MemberSubscriptionsScreen` (stack route + member menu "Memberships"): list, status stats, past-due banner → Payments, cancel-at-period-end with inline confirm, links to membership space. 5 new tests.
- **2026-06-11 — Build specs proposed.** Specs 6–9 (member subscriptions, owner space edit, owner space media, owner calendar) written to §5 with real citations; awaiting go. Two blocking questions: `expo-image-picker` dependency for media uploads; owner calendar as menu entry vs 7th tab.
- **2026-06-11 — Run 5: marketplace browser parity.** `HomeScreen` rewritten onto web's `/api/marketplace/locations` with category tabs, q/date/time/capacity/price/sort/geo filters (web's exact param rules incl. q-drop with lat/lng), location-grouped result cards with starting prices feeding the existing `LocationSpaces` → `SpaceDetail` flow. 5 new tests.
- **2026-06-11 — Run 4: owner payment provider settings.** New `OwnerPaymentSettingsScreen` (stack route `OwnerPaymentSettings`, owner menu "Payment providers") mirroring web's `/owner/settings/payments`: readiness card, Stripe/CardPointe credential forms with write-only secret placeholders, test connection, enable/disable, org/location provider overrides. 5 new tests. Matrix corrected re `/owner/payments` (overview page, not provider settings).
- **2026-06-11 — Run 3: owner dashboard parity.** `OwnerDashboardScreen` now computes web's KPIs (MTD revenue, occupancy, approved bookings, active memberships, today's bookings via `/api/owner/calendar`) with web's exact money math, and gained error + empty (no-locations → create CTA) states. Payment-volume math fixed to be cents-aware and succeeded-only. Tests rewritten (4 tests).
- **2026-06-11 — Run 2: owner request decisions.** Added approve/reject with operator notes to `mobile/src/screens/owner/OwnerBookingsScreen.tsx` (`POST /api/booking-requests/{id}/approve|reject`, reject behind an inline confirm step, list reload + success/error feedback). Added `mobile/__tests__/ownerRequestDecisions.test.tsx` (5 tests). Also this date: fixed repo-wide `mobile-security` CI failures via npm overrides for joi (GHSA-q7cg-457f-vx79) and shell-quote (GHSA-w7jw-789q-3m8p) in PR #185.
- **2026-06-11 — Run 1: member profile parity.** Rewrote `mobile/src/screens/ProfileScreen.tsx` from static (email/role/logout) to full profile editor matching `webUI/app/member/profile/page.tsx`: `GET /api/me` prefill, `PATCH /api/me` save (first/last/phone/company, phone sanitized), loading/error/success states, link to `NotificationsScreen` for prefs (intentional divergence), logout retained. Added `mobile/__tests__/profile.test.tsx` (6 tests). Decisions recorded for Q1–Q5 (§5).
- **2026-06-11 — Step 0 discovery run.** Created this audit. Enumerated 97 web routes and 32 mobile screens; built parity matrix; verified calendar endpoint parity (`/api/me/calendar` both sides), owner approve/deny gap, member profile gap, `role: "member"` hardcode in mobile onboarding, absence of code sharing and deep-link scheme. **No code changed.**

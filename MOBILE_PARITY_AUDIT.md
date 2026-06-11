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
| `/spaces` | `HomeScreen` (Marketplace tab) | partial | mobile has search + filters (`/api/marketplace/search`); filter-set parity unverified |
| `/spaces/[spaceId]` | `member/SpaceDetailScreen` | parity | full booking checkout: preview, promo codes, payment method, membership subscribe |
| `/locations/[locationId]` | `member/LocationSpacesScreen` | parity | `/api/locations/{id}/spaces` |
| `/meeting-rooms{,/[locationId]}` | via `HomeScreen` type filter | partial | no dedicated surface; capability exists via space-type filter |
| `/private-offices{,/[locationId]}` | via `HomeScreen` type filter | partial | same as above |
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
| `/member/subscriptions` | — | missing-on-mobile | subscribe exists in `SpaceDetailScreen`, but no manage-subscriptions screen |

### Owner

| Web route | Mobile screen | Status | Notes |
|---|---|---|---|
| `/owner` (dashboard) | `owner/OwnerDashboardScreen` | partial | mobile shows counts only; web adds 30-day revenue chart, occupancy, today's calendar. Mobile has no error states |
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
| `/owner/payments` | `PaymentsScreen` (history only) | partial | web page = payment **provider settings**; mobile only has history + Stripe connect inside `OwnerSettingsScreen` |
| `/owner/payments/health` | — | missing-on-mobile | |
| `/owner/requests` | `owner/OwnerBookingsScreen` | **partial — confirmed real gap** | web has approve/deny actions (`webUI/app/owner/requests/page.tsx`); mobile lists requests but has **no approve/deny anywhere** (checked `OwnerBookingsScreen` + `BookingDetailScreen`) |
| `/owner/settings` | `owner/OwnerSettingsScreen` | partial | mobile covers pricing rules, promo codes, waitlist, cancellation policies, Stripe connect; full web settings surface unverified |
| `/owner/settings/assistant-policies` | — | missing-on-mobile | |
| `/owner/settings/payments` | `OwnerSettingsScreen` (connect only) | partial | provider enable/disable toggles missing |
| `/owner/spaces/new` | `owner/OwnerAddSpaceScreen` | parity | |
| `/owner/spaces/{edit,[spaceId]/edit}` | — | missing-on-mobile | owners can create but not edit spaces on mobile |
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

1. **Confirmed real gap — owner request approval:** owners cannot approve/deny booking requests on mobile.
2. ~~**Confirmed real gap — member profile editing**~~ — **FIXED in Run 1** (see §6a).
3. **No code sharing:** API clients, types, and availability math are duplicated (§2). Any parity work should consider extracting shared types or accept duplication knowingly.
4. **No deep-link scheme** in `mobile/app.json`; only push-tap → BookingDetail routing exists.
5. **No impersonation on mobile** (web layouts support admin impersonation).
6. **Mobile gaps in state handling:** `OwnerDashboardScreen` lacks error states; `BookingDetailScreen` lacks empty state; auth screens surface errors via `Alert` only.

## 5. Open questions — DECIDED 2026-06-11

- **Q1 — Owner signup/onboarding on mobile:** **ADD TO MOBILE.** Owner role selection + owner/org onboarding flow goes into the backlog as its own proposed screen run (build spec required first).
- **Q2 — Guest & legal pages:** **WEB-ONLY / LINK OUT.** `/booking-payment/[token]`, `/guest/access-pass`, `/privacy`, `/terms` are intentional divergence; mobile links out where needed.
- **Q3 — Desktop-heavy owner suites:** **WANTED ON MOBILE.** `/owner/analytics`, `/owner/marketing/*`, `/owner/loyalty`, `/owner/locations/floor-plan` stay in backlog as missing-on-mobile; build specs proposed one at a time.
- **Q4 — Admin console:** **WANTED ON MOBILE.** The 16 `/admin/*` routes beyond Scanner/Attendance stay in backlog as missing-on-mobile; build specs proposed one at a time.
- **Q5 — Plan order:** **CONFIRMED** as proposed in §6.

Build specs for confirmed `missing-on-mobile` screens will be added here one at a time as their runs are confirmed (per the workflow: propose → confirm → build).

## 6. Proposed plan (ordered, one screen per run)

Fix confirmed gaps in existing screens first (small diffs, high value), then propose missing screens:

1. ~~**Member profile**~~ — **DONE (Run 1, 2026-06-11)**, see §6a.
2. **Owner request approval** — add approve/deny to `OwnerBookingsScreen`/`BookingDetailScreen` per `/owner/requests`. *(confirmed gap — next up)*
3. **Owner dashboard states + KPIs** — error states + missing web KPIs on `OwnerDashboardScreen`. *(partial)*
4. **Owner payments settings** — provider toggles parity vs `/owner/payments`. *(partial)*
5. **Marketplace filters** — verify/align `HomeScreen` filters vs `/spaces`. *(partial)*
6. **Member subscriptions** — propose build spec. *(missing)*
7. **Owner space edit** — propose build spec (`/owner/spaces/[spaceId]/edit`). *(missing)*
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

## 7. Changelog

- **2026-06-11 — Run 1: member profile parity.** Rewrote `mobile/src/screens/ProfileScreen.tsx` from static (email/role/logout) to full profile editor matching `webUI/app/member/profile/page.tsx`: `GET /api/me` prefill, `PATCH /api/me` save (first/last/phone/company, phone sanitized), loading/error/success states, link to `NotificationsScreen` for prefs (intentional divergence), logout retained. Added `mobile/__tests__/profile.test.tsx` (6 tests). Decisions recorded for Q1–Q5 (§5).
- **2026-06-11 — Step 0 discovery run.** Created this audit. Enumerated 97 web routes and 32 mobile screens; built parity matrix; verified calendar endpoint parity (`/api/me/calendar` both sides), owner approve/deny gap, member profile gap, `role: "member"` hardcode in mobile onboarding, absence of code sharing and deep-link scheme. **No code changed.**

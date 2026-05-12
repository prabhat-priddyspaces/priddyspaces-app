# Clerk Auth & Onboarding Implementation

## Overview

Clerk is the identity provider (IdP) for all three surfaces — Next.js web, Expo mobile, and FastAPI backend. Clerk owns identity, sessions, email verification, social OAuth (Google / Apple / Microsoft), and org membership. FastAPI + Postgres own all business data.

```
[ Next.js (web) ]     [ Expo (mobile) ]
        |                      |
        +------- Clerk --------+
        |      (identity)      |
        v                      v
   [ FastAPI ] ←── Clerk JWT (RS256, JWKS)
        |
        v
  [ PostgreSQL ]
        ↑
        |
[ Clerk webhooks → POST /webhooks/clerk ]
```

**Source-of-truth split:**

| Concern | Owner |
|---|---|
| Identity, sessions, passwords, OAuth | Clerk |
| Email verification, MFA | Clerk |
| Org membership sync | Clerk → Postgres (via webhook) |
| Role (`owner` / `member`) | Clerk `publicMetadata.role` (written by backend after onboarding) |
| Platform role (`superadmin` / `admin` / `support`) | Clerk `publicMetadata.platform_role` (set manually) |
| All business data (spaces, bookings, payments, invoices) | Postgres |

---

## Architecture

### JWT Verification (FastAPI)

Every protected API request carries a Clerk-issued RS256 JWT as `Authorization: Bearer <token>`.

`backend/app/core/auth.py` verifies it:
1. Fetches Clerk JWKS from `CLERK_JWKS_URL` (cached with `lru_cache`, auto-busted on key rotation)
2. Matches signing key by `kid` header
3. Decodes using `PyJWT` with `RS256`, `verify_aud=False`
4. Returns the decoded claims dict as the `current_user` dependency

Relevant claims:
- `sub` — Clerk user ID (`user_xxx`) stored in `users.auth_subject`
- `metadata.role` — `owner` or `member` (set by onboarding)
- `metadata.platform_role` — `superadmin`, `admin`, or `support`

### Webhook Sync (FastAPI ← Clerk)

`backend/app/api/webhooks_clerk.py` handles `POST /webhooks/clerk`.

All operations are **idempotent UPSERTs** — replaying any event is safe.

| Clerk event | Postgres action |
|---|---|
| `user.created` | Insert `users` row; `auth_subject = clerk_id` |
| `user.updated` | Update name, email, `role` from `publicMetadata.role` |
| `user.deleted` | Soft-delete (`is_active = False`) |
| `organization.created` | Insert `organizations` row |
| `organization.updated` | Update `name` |
| `organization.deleted` | Delete org row |
| `organizationMembership.created` | Insert `organization_members` |
| `organizationMembership.updated` | Update member role |
| `organizationMembership.deleted` | Delete membership |

Signature verification uses the **svix** library (`Webhook.verify(body, headers)`). Invalid signatures return 401.

If `publicMetadata.platform_role` is set, a `PlatformTeamMember` row is created/updated automatically.

### Onboarding API

Two endpoints under `/api/onboarding/` (all require a valid Clerk JWT):

**`POST /api/onboarding/profile`**
- Called once after sign-up (web redirect to `/onboarding/personal`, mobile `OnboardingScreen`)
- Body: `role` (`member` for normal sign-up, `owner` only from `/owners/sign-up`), `full_name`, `phone`, `country`, `timezone`, `terms_accepted`, `privacy_policy_accepted`
- Writes to `users` table
- Calls `PATCH https://api.clerk.com/v1/users/{clerk_id}` to sync `publicMetadata.role` → Clerk JWT claims update on next token
- Returns `MeOut` (includes `has_organization`, `default_route`)

**`POST /api/onboarding/organization`**
- Owner-only (returns 403 for members)
- Body: `name` (required), `industry`, `size` (1-10 / 11-50 / 51-200 / 200+), `website`
- Creates `Organization`, an owner `OrganizationMember`, and seeds default amenities
- Idempotent: if owner already has an org, updates it in place
- Sets `onboarding_completed = True`
- Returns `MeOut`

---

## Routing Logic

`getDefaultRoute(me)` (web `lib/me.ts`) and `build_default_route()` (backend `platform_auth.py`) apply the same logic:

| Condition | Route |
|---|---|
| `platform_role` is set | `/admin` |
| No `app_role` | `/onboarding/personal` |
| `app_role == "owner"` and no org | `/onboarding/organization` |
| `app_role == "owner"` and has org | `/owner` |
| `app_role == "member"` | `/spaces` |

---

## User Flows

### New email/password sign-up (web)
1. Member visits `/sign-up` → Clerk `<SignUp />` handles account creation + email verification
2. Clerk redirects to `/onboarding/personal` (env var `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL`)
3. User fills name/phone/country, accepts T&C; no role selector is shown
4. `POST /api/onboarding/profile` sends `role: "member"` → sets `users.role`, syncs `publicMetadata.role` to Clerk
5. Response includes `default_route: "/spaces"`

### Hidden owner sign-up (web)
1. Owner visits `/owners/sign-up` directly; this URL is not linked from public navigation
2. Clerk `<SignUp />` handles account creation + email verification
3. Clerk redirects to `/onboarding/personal`, which sends `role: "owner"` for this flow
4. Owner fills org name/industry/size/website → `POST /api/onboarding/organization`
5. Redirected to `/owner`

### Social OAuth sign-up (web)
Same role behavior — `/sign-up` creates members, `/owners/sign-up` creates owners. Clerk handles OAuth callback natively; user lands on `/onboarding/personal`.

### Email/password or OAuth sign-in (web)
1. User visits `/sign-in` → Clerk `<SignIn />` with account linking by verified email
2. Clerk redirects to `/dashboard` (env var `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL`)
3. `/dashboard` fetches `/api/me` → reads `default_route` → redirects

### Mobile sign-in
1. `LoginScreen` — email/password or Google/Apple/Microsoft OAuth (`useOAuth`)
2. `AuthContext` syncs on `isSignedIn` → fetches `/api/me` → sets `me`
3. `AppNavigator.MainApp` gates:
   - `me.role === null` → `OnboardingScreen`
   - `me.role === "owner" && !me.has_organization` → `OrgOnboardingScreen`
   - else → tabs

### Admin login
Admins are created manually in the Clerk dashboard:
1. Create user in Clerk dashboard
2. Set `publicMetadata: { platform_role: "superadmin" | "admin" | "support" }`
3. Clerk webhook fires `user.created` → `PlatformTeamMember` row created
4. Admin can log in via any provider → lands on `/admin`

---

## Credentials & Secrets

### Backend (FastAPI)
Secrets are loaded from **AWS Secrets Manager** at startup when `AWS_SECRET_NAME` is set.

`backend/app/core/config.py` calls `_load_aws_secrets()` on import:
```python
# Merges the JSON blob from Secrets Manager into os.environ.
# Explicit env vars already set are NOT overridden (local .env takes precedence).
```

The Secrets Manager JSON blob should include:
```json
{
  "CLERK_SECRET_KEY": "sk_live_...",
  "CLERK_WEBHOOK_SECRET": "whsec_...",
  "CLERK_JWKS_URL": "https://<clerk-domain>/.well-known/jwks.json",
  "DATABASE_URL": "postgresql://...",
  "STRIPE_SECRET_KEY": "sk_live_...",
  "STRIPE_WEBHOOK_SECRET": "whsec_..."
}
```

Local dev: create `backend/.env` (see `backend/.env.example`).

### Frontend (Next.js)
`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is a **public value** (safe to embed in the client bundle). It is fetched from **AWS SSM Parameter Store** at CI build time:

```yaml
# .github/workflows/deploy-frontend.yml
- name: Fetch Clerk publishable key from SSM
  run: |
    KEY=$(aws ssm get-parameter --name /priddyspaces/clerk_publishable_key --query Parameter.Value --output text)
    echo "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$KEY" >> $GITHUB_ENV
```

Local dev: copy `webUI/.env.local.example` to `webUI/.env.local` and fill in the key.

### Mobile (Expo)
`EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` is embedded in the app bundle at build time. Set it in your EAS build profile or CI environment. See `mobile/.env.example`.

---

## Database Schema Changes

`backend/migrations/versions/0032_clerk_onboarding_fields.py`

**`organizations`** — new columns:
- `clerk_org_id VARCHAR(255) UNIQUE` — Clerk org ID for webhook lookup
- `onboarding_completed BOOLEAN DEFAULT FALSE`
- `industry VARCHAR(128)`
- `size VARCHAR(32)`
- `website VARCHAR(512)`

**`organization_members`** — new column:
- `clerk_membership_id VARCHAR(255) UNIQUE` — Clerk membership ID for idempotent upserts

**No changes to `users`** — `auth_subject` column (already present) is repurposed to store the Clerk user ID (`user_xxx`).

`backend/migrations/versions/0035_member_role_rename.py`

- Updates `users.role` and `organization_members.role` from `customer` to `member`
- Normalizes existing `users.email` values to lowercase/trimmed form
- Adds a unique lower-email index so one logical email can create only one `users` row
- Renames owner-scoped member payment and CRM tables/columns from customer naming to member naming

---

## Clerk Dashboard Setup

1. **Providers**: enable Email + Password, Google, Apple, Microsoft. Disable all others.
2. **Organizations**: enable; set custom roles `admin` and `member`; allow user org creation.
3. **Account linking**: "match by verified email" → ON.
4. **Email verification**: required → ON.
5. **Session token customization** — add to JWT template:
   ```json
   { "metadata": "{{user.public_metadata}}" }
   ```
6. **Webhook endpoint**: `https://{backend_url}/webhooks/clerk`
   - Subscribe to: `user.*`, `organization.*`, `organizationMembership.*`
   - Copy the signing secret → `CLERK_WEBHOOK_SECRET`
7. **After sign-up URL**: `/onboarding/personal`
8. **After sign-in URL**: `/dashboard`

---

## Tests

### Backend (pytest)
`backend/tests/test_clerk_webhooks.py` — 27 test cases:

| Class | What's covered |
|---|---|
| `TestUserUpsert` | Insert, idempotency, role update, email linking, platform_role → PlatformTeamMember, soft-delete, unknown delete noop |
| `TestOrgUpsert` | Insert, name update, delete, unknown delete noop |
| `TestMembershipUpsert` | Insert, idempotency, delete, unknown delete noop, skipped when org unknown |
| `TestWebhookEndpoint` | Invalid signature → 401, user.created → row inserted, duplicate → 200 no dup, org.created, unknown event → 200 ignored |
| `TestOnboardingProfile` | No token → 401, valid role/name/terms, owner role, blank name → 422, invalid role/customer role → 422 |
| `TestOnboardingOrganization` | No token → 401, non-owner → 403, blank name → 422, invalid size → 422, valid creation, idempotent update, `has_organization` true in response |

Run inside Docker: `docker compose exec backend pytest tests/test_clerk_webhooks.py -v`

### Frontend (Vitest)
`webUI/tests/me-default-route.test.ts` — 8 test cases for `getDefaultRoute`:

| Input | Expected route |
|---|---|
| No `app_role` | `/onboarding/personal` |
| Owner, no org | `/onboarding/organization` |
| Owner, has org | `/owner` |
| Member | `/spaces` |
| `platform_role = "superadmin"` | `/admin` |
| `platform_role = "support"` | `/admin` |
| Unknown future role (with `default_route`) | server-provided route |
| Unknown future role (empty `default_route`) | `/onboarding/personal` |

Run: `cd webUI && npx vitest run tests/me-default-route.test.ts`

---

## Files Changed

| File | Change |
|---|---|
| `backend/app/core/auth.py` | Verify Clerk RS256 JWT via JWKS (replaces HS256) |
| `backend/app/core/config.py` | AWS Secrets Manager loader; Clerk vars; removed old JWT/OAuth vars |
| `backend/app/api/webhooks_clerk.py` | **New** — svix-verified webhook handler |
| `backend/app/api/onboarding.py` | **New** — profile + org onboarding endpoints |
| `backend/app/api/me.py` | Compute `has_organization`; pass to `MeOut` and `build_default_route` |
| `backend/app/main.py` | Register onboarding + webhooks_clerk routers |
| `backend/app/models/organization.py` | clerk_org_id, onboarding_completed, industry, size, website |
| `backend/app/models/organization_member.py` | clerk_membership_id |
| `backend/app/schemas/auth.py` | `has_organization: bool` in `MeOut` |
| `backend/app/services/platform_auth.py` | Lookup by `auth_subject`; `build_default_route` handles no-role + no-org |
| `backend/requirements.txt` | + `svix==1.14.0` |
| `backend/migrations/versions/0032_clerk_onboarding_fields.py` | **New** migration |
| `backend/tests/test_clerk_webhooks.py` | **New** — 27 pytest tests |
| `backend/.env.example` | **New** — documents Secrets Manager JSON keys |
| `.github/workflows/deploy-frontend.yml` | SSM fetch for publishable key at build time |
| `webUI/app/layout.tsx` | `<ClerkProvider>` wrapper |
| `webUI/middleware.ts` | **New** — `clerkMiddleware` with public route matcher |
| `webUI/app/sign-in/[[...sign-in]]/page.tsx` | **New** — Clerk `<SignIn />` |
| `webUI/app/sign-up/[[...sign-up]]/page.tsx` | **New** — Clerk `<SignUp />` |
| `webUI/app/onboarding/personal/page.tsx` | Member-only profile form; owner role comes only from hidden owner sign-up |
| `webUI/app/onboarding/organization/page.tsx` | **New** — org creation form |
| `webUI/app/dashboard/page.tsx` | **New** — redirect hub after sign-in |
| `webUI/app/owner/layout.tsx` | Clerk `useAuth()` role guard |
| `webUI/app/member/layout.tsx` | Clerk `useAuth()` role guard |
| `webUI/app/owners/sign-up/[[...sign-up]]/page.tsx` | Hidden owner registration URL |
| `webUI/app/admin/layout.tsx` | Clerk `useAuth()` platform_role guard |
| `webUI/lib/me.ts` | `has_organization`; updated `getDefaultRoute` |
| `webUI/.env.local.example` | **New** — local dev Clerk vars |
| `webUI/tests/me-default-route.test.ts` | **New** — 8 Vitest tests |
| `mobile/App.tsx` | `<ClerkProvider>` + SecureStore token cache |
| `mobile/src/context/AuthContext.tsx` | Rewritten with Clerk hooks (same interface) |
| `mobile/src/navigation/AppNavigator.tsx` | Onboarding gates using `me.role` + `me.has_organization` |
| `mobile/src/screens/LoginScreen.tsx` | Google / Apple / Microsoft OAuth buttons |
| `mobile/src/screens/OnboardingScreen.tsx` | Member-only profile screen |
| `mobile/src/screens/OrgOnboardingScreen.tsx` | **New** — org creation screen |
| `mobile/.env.example` | **New** |

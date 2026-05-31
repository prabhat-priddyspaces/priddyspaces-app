# Auth

## Production Auth Model

Clerk is the production identity provider for web, mobile, and backend API auth.
Clerk owns account creation, passwords, email verification, social OAuth, MFA,
sessions, and organization membership identity. FastAPI owns business data and
authorizes requests by verifying Clerk-issued JWTs.

Canonical implementation details live in
[`docs/clerk-auth-onboarding.md`](./clerk-auth-onboarding.md).

## Request Flow

1. Web or mobile signs the user in with Clerk.
2. The client sends the Clerk session JWT as `Authorization: Bearer <token>`.
3. FastAPI verifies the token against `CLERK_JWKS_URL`.
4. FastAPI resolves or creates the local `users` row from the Clerk subject.
5. Protected API routes enforce app role, platform role, organization, and
   location-scoped authorization.

## Source Of Truth

| Concern | Source of truth |
|---|---|
| Identity, passwords, OAuth, MFA, sessions | Clerk |
| Email verification | Clerk |
| Clerk webhook signature | `CLERK_WEBHOOK_SECRET` |
| App role (`member`, `owner`) | Local onboarding writes Clerk public metadata and Postgres |
| Platform role (`superadmin`, `admin`, `support`) | Clerk public metadata synced to Postgres |
| Bookings, payments, locations, spaces, invoices | Postgres |

## Backend JWTs

Internal HS256 JWTs still exist for legacy local password auth and admin
impersonation tokens. They are not the production web/mobile sign-in path.

Supported legacy endpoints:

- `POST /auth/register`
- `POST /auth/login`

Backend-hosted Google or Apple OAuth routes are intentionally not exposed.
Social sign-in should be configured in Clerk.

## Required Backend Env

- `CLERK_SECRET_KEY`
- `CLERK_WEBHOOK_SECRET`
- `CLERK_JWKS_URL`
- `JWT_SECRET` (internal impersonation and legacy local password auth)
- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `BACKEND_URL`
- `FRONTEND_URL`
- `CORS_ALLOW_ORIGINS`

## Required Web Env

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL`
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL`

## Required Mobile Env

- `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`

## Go-Live Checks

- Clerk publishable key is present in web and mobile build environments.
- Clerk secret key, webhook secret, and JWKS URL are present in backend secrets.
- Clerk sign-in/sign-up redirect URLs point to the application domain, not the
  hosted Account Portal domain.
- `POST /webhooks/clerk` receives signed Clerk user and organization events.
- New member sign-up completes `/api/onboarding/profile` from `/onboarding/member`.
- Owner sign-up completes `/api/onboarding/organization` and creates a pending
  organization review record from `/onboarding/owner`.
- Superadmin owner invitations send owners through Clerk owner sign-up; the
  backend does not issue temporary local passwords for Clerk-owned accounts.
- Platform admin/superadmin roles are present in Clerk public metadata before
  go-live support operations begin.

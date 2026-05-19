# Architecture

## Overview
- Multi-tenant (multiple organizations from day 1)
- Web: Next.js + TypeScript + Tailwind + shadcn/ui
- Mobile: Expo + React Native + TypeScript
- Backend: FastAPI + SQLAlchemy + Alembic + Postgres
- Payments: Stripe Connect (Express)
- Auth: Backend-only JWT (email verification required before payment)
- Email verification required before payment
- UUID v7 public IDs for all externally exposed entities
- Storage: S3 for space/location images (presigned URLs)
- Search: Postgres full-text + geo (PostGIS or Haversine)

## Services
- `webUI` -> member + owner/admin UI
- `mobile` -> member app
- `backend` -> API, auth, payments, webhooks
- `backend worker` -> background jobs for marketing, assistant reminders/alerts, and settlement polling
- `db` -> Postgres (Docker)

## Public ID Rule
- All external identifiers use `public_id` (UUID v7)
- Internal numeric `id` is DB-only

## Payment Model (MVP)
- Memberships: Stripe Subscriptions (optional)
- Bookings: Stripe PaymentIntents (request-to-book default)
- Webhooks are source of truth (idempotent via payment_events)

## Security Notes
- Never store card data
- Webhook signature verification
- Audit log for all pricing overrides
- Location-scoped access for admins

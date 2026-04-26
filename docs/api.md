# API (MVP)

## Conventions
- All external IDs use `public_id` (UUID v7).
- Admin access is scoped to assigned locations.
- Webhooks are the source of truth for payment state.

## Auth
- Backend-only JWT
- Email verification required before payment.
- All endpoints require auth unless explicitly marked public.

## Core Endpoints (proposed)
### Organizations
- `POST /api/orgs`
- `GET /api/orgs/{org_public_id}`

### Locations
- `POST /api/locations`
- `GET /api/locations/{location_public_id}`
- `GET /api/locations?organization_public_id=...`

### Media (images)
- `POST /api/media/presign`
- `POST /api/media`
- `GET /api/spaces/{space_public_id}/media`

### Spaces
- `POST /api/spaces`
- `GET /api/spaces/{space_public_id}`
- `GET /api/locations/{location_public_id}/spaces`
- `PATCH /api/spaces/{space_public_id}/override-price`

### Organization Members
- `POST /api/orgs/{org_public_id}/members`

### Memberships
- `POST /api/memberships`
- `GET /api/memberships/{membership_public_id}`

### Bookings
- `POST /api/booking-requests`
- `POST /api/booking-requests/{booking_request_public_id}/approve`
- `POST /api/booking-requests/{booking_request_public_id}/reject`
- `POST /api/bookings`
- `GET /api/bookings/{booking_public_id}`

### Pricing
- `POST /api/pricing-rules`
- `GET /api/pricing-rules?space_public_id=...`
- `POST /api/promo-codes`
- `GET /api/promo-codes`

### Feature Flags
- `POST /api/feature-flags`
- `GET /api/feature-flags?scope=tenant|space`

### Payments
- `POST /api/payments/intent`
- `POST /api/payments/membership`

### Stripe Connect
- `POST /api/stripe/connect/onboard`
- `GET /api/stripe/connect/status`

### Marketplace (public)
- `GET /api/marketplace/search`
- `GET /api/spaces/{space_public_id}`

### Webhooks
- `POST /api/webhooks/stripe`

## Stripe Webhooks (MVP)
- `invoice.paid`
- `invoice.payment_failed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `payment_intent.succeeded`
- `payment_intent.payment_failed`

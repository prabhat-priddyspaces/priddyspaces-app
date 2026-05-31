# API (MVP)

## Conventions
- All external IDs use `public_id` (UUID v7).
- Admin access is scoped to assigned locations.
- Webhooks are the source of truth for payment state.

## Auth
- Clerk JWTs are the production auth token; internal backend JWTs are limited
  to impersonation and legacy local password auth.
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
- `POST /api/bookings/{booking_public_id}/check-in`
- `POST /api/bookings/{booking_public_id}/check-out`

### Space Access Passes
- `GET /api/access-passes` - member-only list of valid/upcoming passes for confirmed bookings.
- `POST /api/access-passes` - member-only ensure/get pass for one owned confirmed booking.
- `POST /api/access-passes/resolve` - reception, owner, assigned admin/staff, or platform team resolves a scanned QR token.
- `POST /api/access-passes/public/resolve` - public guest fallback link resolves token status for email QR pages.
- `POST /api/access-passes/check-in` - validates token, role/location scope, payment state, booking status, and booking window before creating attendance.
- `POST /api/access-passes/check-out` - records checkout after check-in.

### Attendance
- `GET /api/attendance` - owner/admin/platform attendance history with filters for location, date, space type, currently in office, checked in/out, and member name/email.
- `GET /api/attendance/current` - owner/admin/platform list of members currently checked in.
- `GET /api/attendance/locations` - location options visible to the current owner/admin/platform user.
- `GET /api/member/directory` - member-only same-location directory based on active memberships or recent confirmed bookings.

### Notifications
- `GET /api/push/config` - returns web-push availability and VAPID public key.
- `POST /api/push-subscriptions` - registers a web or Expo push subscription for the current user.
- `DELETE /api/push-subscriptions/{public_id}` - deactivates the current user's subscription.
- `GET /api/notifications` - lists the current user's in-app notifications with unread count.
- `PATCH /api/notifications/{public_id}/read` - marks one notification as read.
- `GET/PATCH /api/notifications/preferences` - current user's booking start/end reminder preferences.
- `GET/POST/PATCH /api/orgs/{org_public_id}/members` includes owner-team start/end push reminder toggles.

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

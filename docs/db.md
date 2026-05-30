# Database Notes (MVP)

## Core Entities
- Tenant (Organization)
- TenantUser
- Location (timezone, geo)
- Space (type, capacity, amenities, availability)
- SpaceImage
- PricingRule
- PromoCode
- FeatureFlag
- CancellationPolicy
- MembershipPlan
- Membership
- BookingRequest
- Booking
- Invoice
- Payment
- PaymentEvent
- SpaceAccessPass
- SpaceAttendanceRecord
- User
- AuditLog

## Key Rules
- `public_id` UUID v7 on all externally exposed entities.
- Space can be 1 reservable unit or have capacity > 1 (admin decides on creation).
- Bookings blocked if overlapping with CONFIRMED bookings or active memberships.
- Email verification required before allowing payment.
- Pricing overrides only when admin permission toggle enabled.
- All tenant-owned records include `tenant_id`.
- Space access passes are generated only for confirmed bookings and are invalidated by cancellation, rejection, refund, void, expiry, or checkout.
- QR codes must contain only an opaque access token/fallback URL; token lookup uses a hash and server-side validation.
- Attendance stores one check-in event and one check-out event per booking, including scanner user, member, booking, location, space, and timestamp.

## Suggested Fields (examples)
### Location
- id (internal)
- public_id (uuid v7)
- tenant_id
- name
- address
- timezone
- lat
- lng

### Space
- id
- public_id
- location_id
- tenant_id
- space_type
- capacity
- amenities (array)
- visibility (public/unlisted/private)
- availability_hours (json)

### Membership
- id
- public_id
- user_id
- space_id (primary)
- tenant_id
- status
- start_date
- end_date
- stripe_subscription_id

### Booking
- id
- public_id
- user_id
- space_id
- tenant_id
- start_datetime
- end_datetime
- status
- stripe_payment_intent_id
- checked_in_at
- checked_out_at

### SpaceAccessPass
- id
- public_id
- tenant_id
- booking_id
- booking_request_id
- location_id
- space_id
- user_id
- token_hash
- token_encrypted
- valid_from_at
- expires_at
- status
- revoked_at
- revoked_reason
- last_used_at

### SpaceAttendanceRecord
- id
- public_id
- tenant_id
- access_pass_id
- booking_id
- location_id
- space_id
- member_id
- scanned_by_user_id
- event_type (`check_in` or `check_out`)
- status
- event_at

### User
- id
- public_id
- email
- full_name
- email_verified
- stripe_customer_id
- stripe_default_payment_method_id

### TenantUser
- id
- public_id
- tenant_id
- user_id
- role
- can_override_pricing

### PricingRule
- id
- public_id
- tenant_id
- space_id
- rate_hourly
- rate_daily
- active_from
- active_to

### PromoCode
- id
- public_id
- tenant_id
- code
- discount_type (percent/fixed)
- discount_value
- starts_at
- ends_at

### FeatureFlag
- id
- tenant_id
- flag_key
- flag_value
- scope_type (tenant/space)
- scope_id

### CancellationPolicy
- id
- tenant_id
- space_type
- cancel_window_hours
- refund_percent

### AuditLog
- id
- actor_id
- action
- entity_type
- entity_public_id
- before_state
- after_state
- created_at

### PaymentEvent
- id
- public_id
- provider
- event_id (unique)
- event_type
- payload
- created_at

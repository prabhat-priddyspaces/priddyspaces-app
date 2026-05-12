# Instant Booking, Availability, Payments, And Refunds Plan

## Executive Summary

Priddyspaces should support instant booking for low-risk, transactional inventory and keep request-to-book for high-value inventory.

- Instant booking: meeting rooms and day-pass/shared-desk inventory.
- Request-to-book: private offices, suites, leases, memberships, and owner-reviewed exceptions.
- Payment model: full upfront charge for instant bookings, charge-on-approval for request-to-book.
- Availability model: timezone-safe, buffer-aware, recurrence-aware, and race-safe.
- Refund model: tiered cancellation policy snapshot at purchase time, with refunds recorded in an internal ledger.
- Owner finance model: payout visibility from internal payment records, not external provider balance sync in v1.
- Deposit support is intentionally excluded from v1.

## Product Rules

### Must Have

- Customers can reserve eligible meeting rooms and day passes without owner approval when they have a saved payment method.
- Customers can still request private offices and suites without immediate approval.
- Owners can configure buffer time before and after a booking.
- Owners can configure tiered cancellation refund policies by space type.
- Owners can see payment ledger totals: gross, tax, refunds, platform fees, owner net, successful payment count, and failed payment count.
- Failed instant payments cancel the booking hold and leave a retryable payment-failed request.
- Availability prevents overlapping confirmed bookings, pending holds, and active request-to-book records.
- Recurring weekly/monthly bookings validate every occurrence before charging.
- Refund calculations use the policy snapshot captured when the booking was created.

### Should Have

- Calendar picker communicates blocked/buffered time clearly.
- Recurrence controls remain simple in v1: one-time, weekly, monthly, count capped at 52.
- Public detail pages show `Reserve & Pay` for instant-eligible inventory and `Request to Book` for high-value spaces.
- Mobile booking uses picker-style date/time selection instead of raw datetime text input.
- Receipts and invoices are generated for successful booking charges and visible to customers/owners.

### Later

- Provider balance sync and payout reconciliation against Stripe/CardPointe settlement reports.
- Deposits, split payments, and payment schedules.
- Owner-configurable blackout dates and staff-only override flows.
- Self-serve saved-card management in mobile.

## Backend Design

### Data Model

- `spaces.buffer_before_minutes`
- `spaces.buffer_after_minutes`
- `booking_series`
- `bookings.inventory_start_datetime`
- `bookings.inventory_end_datetime`
- `bookings.booking_series_id`
- `bookings.booking_request_id`
- `bookings.recurrence_sequence`
- `booking_requests.instant_booking`
- `booking_requests.booking_series_id`
- `booking_requests.recurrence_frequency`
- `booking_requests.recurrence_interval`
- `booking_requests.recurrence_count`
- `booking_requests.recurrence_until_date`
- `booking_requests.occurrence_count`
- `booking_requests.pricing_snapshot`
- `booking_requests.refund_policy_snapshot`
- `payments.amount_cents`
- `payments.subtotal_cents`
- `payments.discount_cents`
- `payments.tax_cents`
- `payments.refunded_amount_cents`
- `payments.booking_series_id`
- `payments.pricing_snapshot`
- `payments.refund_policy_snapshot`
- `payment_refunds`
- `cancellation_policy_tiers`

### Availability And Inventory

- Convert all incoming datetimes to UTC.
- Validate against the location timezone for local open hours and DST behavior.
- Validate that start/end align to the location booking granularity.
- Expand recurrence in local time so weekly/monthly series preserve the same wall-clock booking time.
- Apply buffer windows to inventory hold timestamps.
- Treat active subscriptions, pending bookings, confirmed bookings, and requested booking requests as blockers.
- Lock the space row during validation and hold creation.
- On PostgreSQL, enforce overlap prevention with a GiST exclusion constraint on active booking inventory ranges.
- On SQLite/test environments, enforce the same behavior through service-level overlap checks.

### Booking Flow

1. Customer submits a booking request payload.
2. API resolves the space and location.
3. API expands recurrence, validates open hours, buffers, conflicts, and granularity.
4. API resolves required payment method after availability validation so unavailable slots return a 409 instead of a payment-method error.
5. If the space is instant-eligible, API creates pending booking holds before charging.
6. Payment charge succeeds:
   - booking hold becomes confirmed,
   - recurring child holds become confirmed,
   - request becomes approved,
   - invoice is generated,
   - booking series becomes active.
7. Payment charge fails:
   - booking hold is canceled,
   - request becomes payment_failed,
   - payment row stores the failure and idempotency key,
   - retry revalidates availability before creating a new hold.
8. If the space is request-to-book, API keeps the request in requested status until owner approval.

### Payment Flow

- Use deterministic idempotency keys:
  - booking charge: `booking_{request_public_id}_attempt_{n}`
  - refund: `refund_{payment_public_id}_{booking_public_id}_{amount_cents}`
- Store pricing and refund policy snapshots on both request and payment rows.
- Charge amount is calculated from pricing rules, hourly/daily rates, volume discounts, tax config, and occurrence count.
- Existing successful payments short-circuit to prevent duplicate charges.
- Failed payments are durable rows with attempt number and provider failure reason.

### Refund Flow

- Cancellation calculates refund percent from the payment/request refund policy snapshot.
- No policy means full refund in v1.
- Policy tiers are ordered by minimum hours before start.
- Refunds can be full, partial, zero, voided, refunded, or failed.
- Refund records are durable in `payment_refunds`.
- Payment status updates to `voided`, `refunded`, or `partially_refunded`.
- Booking and booking request cancellation commits the booking cancellation and refund state together.

### Owner Payout Summary

- API: `GET /api/owner/payout-summary?organization_public_id=...`
- Source of truth: internal `payments` rows.
- Returns:
  - `gross_cents`
  - `tax_cents`
  - `refunded_cents`
  - `platform_fee_cents`
  - `owner_net_cents`
  - `succeeded_count`
  - `failed_count`
- v1 does not claim provider settlement status.

## Web Implementation

- Public space detail:
  - `Reserve & Pay` for instant-eligible spaces.
  - `Request to Book` for private office/suite lease widgets.
  - timezone-safe UTC payload conversion based on location timezone.
  - weekly/monthly recurrence payload.
  - buffer display.
  - tiered cancellation policy display.
- Owner space create/edit:
  - buffer before/after controls.
- Owner settings:
  - tiered cancellation policy editor.
- Owner payments:
  - payout ledger summary panel.
- E2E:
  - customer Reserve & Pay path covers saved payment method, booking payload, paid request detail, and invoice display.

## Mobile Implementation

- Space detail:
  - picker-style date and time chips.
  - hourly/full-day mode.
  - `Reserve & Pay` or `Request to book` action label.
  - saved payment method resolution before submit.
  - explicit `booking_mode`, `full_day`, and authorization consent payload.
  - instant success, payment failure, and request-submitted messages.
- Booking detail:
  - payment status and refund amount display when present.

## Test Plan

### Backend

- Full backend suite.
- Instant booking success and 409 overlap prevention.
- Payment failure releases holds.
- Retry and idempotency prevent double charge.
- Weekly recurring instant booking creates confirmed child bookings and an active series.
- Tiered refund percent calculation.
- Owner payout summary gross totals.
- Marketplace policy response includes refund tiers.

### Web

- Vitest component/unit suite.
- Next production build.
- Full Playwright suite.
- Customer Reserve & Pay e2e path.

### Mobile

- Jest suite.
- TypeScript no-emit check.

## Rollout Checklist

- Apply migration before enabling instant booking broadly.
- Confirm PostgreSQL has `btree_gist` extension permission.
- Ensure payment provider settings are enabled for organizations using instant booking.
- Seed or configure refund tiers per space type before launch.
- Start with instant booking enabled for meeting rooms and shared desks only.
- Monitor payment_failed requests and overlap conflict rates after rollout.
- Reconcile internal payout summary with provider reports manually until provider balance sync is added.

## Known V1 Constraints

- Deposits are not implemented.
- Provider payout/balance sync is not implemented.
- Mobile can use an existing saved payment method but does not yet provide full native card management.
- Recurrence supports weekly/monthly only and caps at 52 occurrences.

# TODO (MVP Build Plan)

## Phase 0: Alignment & Baselines
- [ ] Update architecture/API/DB docs to SOW (request-to-book, Connect, flags)
- [ ] Confirm auth flow (backend JWT) and IdP providers
- [ ] Confirm membership scope and pricing rules

## Phase 1: Tenancy, Auth, RBAC
- [ ] Tenant model + tenant middleware (API)
- [ ] JWT auth endpoints + refresh flow
- [ ] Role permissions (owner/admin/staff/member)

## Phase 2: Locations, Spaces, Media
- [ ] Location CRUD (timezone, geo)
- [ ] Space CRUD (type, capacity, amenities, visibility)
- [ ] Availability hours per space
- [ ] S3 media presign + save metadata + list

## Phase 3: Pricing & Policies
- [ ] Pricing rules (hourly/daily, no overlaps)
- [ ] Membership plans (monthly)
- [ ] Promo codes (fixed/percent)
- [ ] Tiered cancellation policy by space type
- [ ] Basic tax rate config

## Phase 4: Booking Engine
- [ ] Booking request flow (REQUESTED -> APPROVED/REJECTED)
- [ ] Booking confirmation after payment (PAID -> CONFIRMED)
- [ ] Conflict checks (booking + membership overlap)
- [ ] Instant booking feature flag

## Phase 5: Payments & Invoicing
- [ ] Stripe Connect onboarding (Express)
- [ ] PaymentIntents for bookings after approval
- [ ] Stripe subscriptions for memberships
- [ ] Webhook verification + idempotency
- [ ] Invoice PDF + receipt artifacts

## Phase 6: Marketplace & Search
- [ ] Public listing pages (SEO, UUID URLs)
- [ ] Search API (full-text + geo)
- [ ] Availability preview

## Phase 7: Notifications & Audit
- [ ] Email notifications (request, approve/reject, receipt, cancel)
- [ ] Audit logs (pricing, approvals, refunds)

## Phase 8: QA & Hardening
- [ ] Tenant isolation tests
- [ ] Booking conflict tests
- [ ] Webhook replay tests
- [ ] Load test search/availability

# Product Flows

## 1) Membership flow (customer, optional)
```mermaid
sequenceDiagram
  participant C as Customer
  participant W as Web/Mobile
  participant API as Backend API
  participant S as Stripe

  C->>W: Select location + space
  W->>API: Create Stripe customer
  API->>S: Create customer
  S-->>API: customer_id
  API-->>W: customer_id
  W->>S: Collect card (Stripe UI)
  W->>API: Create subscription request
  API->>S: Create subscription
  S-->>API: subscription_id
  Note over API: Wait for webhook
  S-->>API: invoice.paid
  API->>API: Activate subscription
  API-->>W: Subscription active
```

## 2) Booking flow (request-to-book default)
```mermaid
sequenceDiagram
  participant C as Customer
  participant W as Web/Mobile
  participant API as Backend API
  participant S as Stripe

  C->>W: Select space + time
  W->>API: Validate availability
  API-->>W: Available
  W->>API: Create booking request
  API-->>W: Status = REQUESTED
  API->>API: Notify operator
  W->>API: Operator approves
  API-->>W: Status = APPROVED
  W->>API: Create PaymentIntent
  API->>S: Create PaymentIntent
  S-->>API: payment_intent_id
  Note over API: Confirm only after webhook
  S-->>API: payment_intent.succeeded
  API->>API: Confirm booking
  API-->>W: Booking confirmed
```
Instant booking can be enabled per tenant or space via feature flag; when enabled, payment is collected immediately and the booking auto-confirms.

## 3) Pricing override (admin)
```mermaid
sequenceDiagram
  participant A as Admin
  participant W as Web
  participant API as Backend API

  A->>W: Override price
  W->>API: Request override (reason required)
  API->>API: Check permission toggle
  API->>API: Save override + audit log
  API-->>W: Override applied
```

## 4) Booking conflict rule
- Prevent overlaps with CONFIRMED bookings or active memberships.

## 5) Space image upload (owner/admin)
```mermaid
sequenceDiagram
  participant O as Owner/Admin
  participant W as Web
  participant API as Backend API
  participant S as S3

  O->>W: Upload space image
  W->>API: Request presigned URL
  API-->>W: upload_url + key
  W->>S: PUT image
  W->>API: Save image metadata
  API-->>W: Image saved
```

## 6) Cancellation policy (tiered)
- Cancellation window and refundability are set by space type and enforced server-side.

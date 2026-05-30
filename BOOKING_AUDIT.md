# Booking Availability Audit

> Generated: 2026-05-30 · Read-only investigation, no code was modified.

---

## Repo Map

| Layer | Path |
|---|---|
| Backend API routes | `backend/app/api/` |
| Backend services | `backend/app/services/` |
| Data models (SQLAlchemy) | `backend/app/models/` |
| Public booking page | `webUI/app/spaces/[spaceId]/` |
| Member booking page (legacy) | `webUI/app/member/spaces/[spaceId]/` |
| Booking widget component | `webUI/components/public-space-detail-view.tsx` |
| Legacy widget component | `webUI/components/space-detail-view.tsx` |
| Availability calendar UI | `webUI/components/availability-calendar.tsx` |
| Availability utilities | `webUI/lib/space-availability.ts` |
| Availability API | `backend/app/api/marketplace.py` |
| Availability service | `backend/app/services/space_availability.py` |
| Conflict/overlap service | `backend/app/services/booking_inventory.py` |
| Simple overlap helpers | `backend/app/services/availability.py` |

---

## Part 1 — What Exists Today

### 1.1 Confirmed Booking Data Model

**`backend/app/models/booking.py`** — `Booking` table (`bookings`)

| Field | Type | Notes |
|---|---|---|
| `id` | Integer PK | Internal |
| `public_id` | String | Exposed via API |
| `user_id` | Integer | Booking member |
| `space_id` | Integer | Space being booked |
| `tenant_id` | Integer | Owner organisation |
| `start_datetime` | DateTime (UTC) | Booking wall-clock start |
| `end_datetime` | DateTime (UTC) | Booking wall-clock end |
| `inventory_start_datetime` | DateTime (UTC), nullable | `start - buffer_before_minutes` |
| `inventory_end_datetime` | DateTime (UTC), nullable | `end + buffer_after_minutes` |
| `booking_series_id` | Integer, nullable | Links recurring series |
| `booking_request_id` | Integer, nullable | Links approval request |
| `recurrence_sequence` | Integer, nullable | Position in series |
| `status` | Enum | `PENDING`, `CONFIRMED`, `CANCELED` |
| `stripe_payment_intent_id` | String, nullable | Payment reference |
| `checked_in_at` / `checked_out_at` | DateTime, nullable | Attendance tracking |
| `no_show` | Boolean | No-show flag |
| `created_at` / `updated_at` | DateTime | Mixin timestamps |

A booking is created in two ways:

1. **Instant booking**: A `PENDING` booking is created at request-submission time (`create_pending_booking_hold`, `booking_inventory.py:235`). It is upgraded to `CONFIRMED` after payment succeeds.
2. **Request-to-book**: A `BookingRequest` record is created with `status=REQUESTED`. The owner approves it manually, triggering booking creation and payment. `booking_requests.py:985–1048`.

---

### 1.2 How a Confirmed Booking is Created

Entry point: **`POST /booking-requests`** (`backend/app/api/booking_requests.py:888`)

Flow:
1. Load `Space` and `Location`.
2. Expand recurrence into `InventoryOccurrence` objects (`booking_inventory.py:91`).
3. **Acquire a row-level write lock on the Space row** (`booking_requests.py:941`):
   ```python
   db.query(Space).filter(Space.id == space.id).with_for_update().first()
   ```
4. Call `validate_occurrences_available()` (`booking_inventory.py:158`) — see §1.3.
5. Validate payment method.
6. Create `BookingRequest` record with `status=REQUESTED`.
7. **Instant bookings only**: create `PENDING` Booking holds, commit, then charge via Stripe. On payment success the request transitions to `APPROVED` and bookings to `CONFIRMED`.
8. **Non-instant**: queue request for owner approval. Owner approval re-runs `validate_occurrences_available` again before creating booking holds (`booking_requests.py:1428`).
9. Catch `IntegrityError` → rollback → return HTTP 409 (`booking_requests.py:1046–1048`).

---

### 1.3 Conflict and Overlap Detection

**`backend/app/services/booking_inventory.py:158` — `validate_occurrences_available()`**

For each occurrence it checks:

| Check | Implementation |
|---|---|
| Space not OCCUPIED/MAINTENANCE | `space.availability_status != AVAILABLE → 409` (line 167) |
| Within opening hours | `start_local < open_start or end_local > open_end → 409` (line 181) |
| Duration ≥ granularity | `_minutes_between(start, end) < granularity → 400` (line 183) |
| Start/end aligned to granularity | modulo check → 400 (lines 185–188) |
| No exclusive subscription overlap | Queries `Subscription` for `private_office_lease`/`suite_lease` (lines 190–206) |
| No existing Booking overlap | Queries PENDING+CONFIRMED Bookings using `inventory_*` fields (lines 208–217): `coalesce(inventory_start, start) < occurrence.inventory_end AND coalesce(inventory_end, end) > occurrence.inventory_start` |
| No pending BookingRequest overlap | Queries REQUESTED BookingRequests (lines 219–232) |

The booking overlap check uses the **inventory (buffer-extended) datetimes** on both sides, so pre- and post-booking buffers are respected.

Simpler one-shot helpers (`backend/app/services/availability.py`) exist for other callers:
- `booking_overlaps()` — line 11 (no buffer logic)
- `booking_request_overlaps()` — line 25

---

### 1.4 Concurrency Handling

**Row-level lock** — `booking_requests.py:941`:
```python
db.query(Space).filter(Space.id == space.id).with_for_update().first()
```
This serialises all booking attempts on the same space within the database. Two concurrent transactions for the same `space_id` will queue at this lock; the second one runs `validate_occurrences_available()` after the first has committed (or rolled back) its booking holds.

**`IntegrityError` safety net** — `booking_requests.py:1046`:
```python
except IntegrityError:
    db.rollback()
    raise HTTPException(status_code=409, detail="Booking overlaps existing booking")
```
This catches any overlap that slips past the app-level check (e.g., due to a database constraint violation).

**Assessment**: The concurrency protection is sound for the same space. Two concurrent requests for the same space will serialise at the Space row lock. The overlap checks run while the lock is held, so the second request sees the first request's Booking hold. **Double-booking is not currently possible** for the same space through the public booking flow — the server will return 409 to one of the two racing requests.

---

### 1.5 Availability Source (Frontend)

**`webUI/components/public-space-detail-view.tsx:155–186`**

On mount the component fetches:
```
GET /api/marketplace/spaces/{id}/availability?from=<today>&to=<today+60>
```
This returns a `SpaceAvailabilityResponse` (`backend/app/api/marketplace.py:303`):
```json
{
  "timezone": "America/New_York",
  "granularity_minutes": 60,
  "availability_start_time": "09:00",
  "availability_end_time": "18:00",
  "buffer_before_minutes": 0,
  "buffer_after_minutes": 0,
  "hourly_price": "45.00",
  "daily_price": "150.00",
  "days": [
    { "date": "2026-05-30", "fully_blocked": false, "busy_intervals": [{"start":"09:00","end":"11:00"}] },
    ...
  ]
}
```

**`backend/app/services/space_availability.py:24` — `get_space_availability()`**:
- Queries PENDING+CONFIRMED Bookings in range (uses `inventory_*` datetimes).
- Queries REQUESTED BookingRequests in range.
- Queries active/past_due Subscriptions.
- `fully_blocked = True` only when an exclusive subscription (private_office_lease / suite_lease) covers the entire day — **not** from bookings.
- When bookings cover the full day, `busy_intervals` will span the whole open window; `isDayBookable()` on the frontend returns `false` and the date is rendered as unavailable.

---

### 1.6 Frontend Calendar and Time-Slot Logic

**`webUI/components/availability-calendar.tsx`**

Receives `days: SpaceAvailabilityDay[]`. For each calendar cell:
```typescript
const bookable = !beforeMin && isDayBookable(day, open, granularityMinutes);
```
Non-bookable cells are rendered with `line-through` and are not clickable.

**`webUI/lib/space-availability.ts`**

| Function | Lines | Role |
|---|---|---|
| `isDayBookable()` | 124 | Returns `false` if no open interval ≥ granularity |
| `getOpenIntervalsForDay()` | 83 | Subtracts `busy_intervals` from `[open.start, open.end]`, returns free windows |
| `buildSlotOptions()` | 136 | Generates selectable start times within free windows |
| `buildEndSlotOptions()` | 151 | Generates selectable end times after a chosen start, within the same free window |

**`webUI/components/public-space-detail-view.tsx:916–937`**

The `AvailabilityCalendar` is passed `availability?.days ?? []`. When a date is selected, `buildSlotOptions` and `buildEndSlotOptions` recompute from the selected day's free intervals.

---

### 1.7 Legacy Member Booking View

**`webUI/components/space-detail-view.tsx`** (served at `/member/spaces/[spaceId]`)

This is an older component that:
- Uses two bare `<input type="datetime-local">` fields (lines 253–264) — no dropdown, no calendar.
- **Does not fetch availability data.**
- **Does not use `AvailabilityCalendar`.**
- **Does not filter time slots.**
- A user can enter any arbitrary datetime and submit.
- The server will still reject a conflict with HTTP 409, but the UX gives no signal before submission.

---

## Part 2 — Target Behavior Assessment

### A. Full-day blocking — **PARTIAL**

**Requirement**: if a space is fully booked for a day, the date must be disabled in the date picker.

**Evidence**:
- `fully_blocked` in the API response is only set for exclusive subscriptions (`space_availability.py:76–83`). Bookings that collectively span an entire day are **not** marked `fully_blocked`; instead their times appear in `busy_intervals`.
- In the frontend, `isDayBookable()` (`space-availability.ts:124`) returns `false` when `getOpenIntervalsForDay()` yields no interval ≥ granularity. This correctly disables the date in `AvailabilityCalendar`.
- The date disabling therefore **does work** for booking-driven full-day blocks, but only through the indirect `isDayBookable` path. The `fully_blocked` field itself is misleadingly narrow.
- **Gap**: The legacy `space-detail-view.tsx` component does not use `AvailabilityCalendar` at all, so full-day blocking does not apply there.

### B. Partial-day dates stay open — **EXISTS**

**Evidence**: `getOpenIntervalsForDay()` (`space-availability.ts:83`) subtracts only the busy intervals from the open window. If part of the day is free, the function returns those remaining intervals. `isDayBookable()` returns `true` if any such interval is ≥ `granularityMinutes`. The date remains selectable in `AvailabilityCalendar`.

### C. Time-slot filtering — **PARTIAL**

**Evidence**:
- In `public-space-detail-view.tsx` (the main public booking page at `/spaces/[spaceId]`): `buildSlotOptions` and `buildEndSlotOptions` are derived from `getOpenIntervalsForDay(selectedDay, openWindow)` (lines 213–223). Only free time ranges appear in the dropdowns. This is correct.
- In `space-detail-view.tsx` (the member page at `/member/spaces/[spaceId]`): raw `<input type="datetime-local">` allows any value. **No slot filtering.** MISSING for this path.
- The guest-checkout path uses the same `public-space-detail-view.tsx` component and therefore inherits the correct filtering.

### D. Calendar as source of truth — **PARTIAL**

**Evidence**:
- `public-space-detail-view.tsx` fetches `GET /api/marketplace/spaces/{id}/availability` on mount (line 169). Dates and time slots are driven entirely by that response. Source-of-truth is the database. **EXISTS for this path.**
- `space-detail-view.tsx` fetches no availability data. It shows all dates and times freely. **MISSING for this path.**
- The availability fetch is a one-shot call on page load covering a 60-day window (`AVAILABILITY_RANGE_DAYS = 60`, line 61). There is no refresh. If another user books a slot while this user has the page open, the UI will not update until a page reload — but the server will return 409 on submit. **Stale-data risk present but caught server-side.**

---

## Part 3 — Recommended Implementation Plan

### Summary of Gaps

| Gap | Impact | Priority |
|---|---|---|
| Legacy `space-detail-view.tsx` has no availability awareness | Member booking flow shows no busy times, can't prevent selection of taken slots in the UI | High |
| `fully_blocked` is only set for subscriptions, not for booking-saturated days | Minor API-contract confusion; functionally masked by `isDayBookable()` | Low |
| Availability is fetched once on load with no real-time refresh | Stale UI for long sessions; server rejects with 409, but user sees no warning until submit | Medium |
| Lease/membership widget (`lease-booking-widget.tsx`) has no date availability check | Move-in date can conflict with an existing subscription | Low (server validates) |

---

### Step 1: Extend the availability API to mark days fully blocked by bookings

**File**: `backend/app/services/space_availability.py`

Currently `fully_blocked` is only set when a subscription covers the day. Add a second pass: if `busy_intervals` for a day span the entire open window `[availability_start_time, availability_end_time]`, set `fully_blocked = True` as well.

```
For each day:
  if any subscription covers it → fully_blocked = True  (already done)
  elif all of [open_start, open_end] is covered by merged busy_intervals → fully_blocked = True
```

This is a backward-compatible change (a field that was `False` in some cases becomes `True`). No schema change needed. The frontend already handles `fully_blocked = True` by showing the date as unavailable.

**Why**: Currently `isDayBookable()` on the frontend handles this correctly, but calling code outside the UI that reads the raw API response (e.g., mobile clients, integrations) would not see a clean "fully blocked" signal from bookings.

---

### Step 2: Replace the legacy member booking widget with the availability-aware one

**File**: `webUI/components/space-detail-view.tsx` → `webUI/app/member/spaces/[spaceId]/page.tsx`

The public-facing `PublicSpaceDetailView` already has full availability awareness. The simplest fix is to redirect the member-facing page to use `PublicSpaceDetailView` (or the same `public-space-detail-view.tsx` component) instead of the legacy `SpaceDetailView`.

Concrete steps:
1. In `webUI/app/member/spaces/[spaceId]/page.tsx`, replace `<SpaceDetailView>` with `<PublicSpaceDetailView>` (already exported from `public-space-detail-view.tsx`).
2. Verify the `backHref` prop points to `/member` or `/member/spaces`.
3. The component already handles authenticated vs unauthenticated state, guest checkout, and membership plans. The only difference may be the back-link label.
4. Deprecate `webUI/components/space-detail-view.tsx` once no other page uses it.

No data-model or API changes needed for this step.

---

### Step 3: Validate that time-slot dropdowns prevent selecting a booked range

**Files**: `webUI/lib/space-availability.ts`, `webUI/components/public-space-detail-view.tsx`

`buildSlotOptions` and `buildEndSlotOptions` already implement this correctly for the public view (Step 2 carries this forward to the member view). Verify the following edge cases in tests:

- A space open 09:00–18:00 with a booking 10:00–12:00: start options must include 09:00 and 12:00, must NOT include 10:00 or 11:00.
- A space open 09:00–11:30 with 60-min granularity and a booking 09:00–10:00: only start option is 10:00; end option is 11:00. 10:30 start must not appear (would need 60 min but only 30 available).
- A space with a booking that fills the entire open window: date is disabled, no time options.

Add unit tests in `webUI/tests/` covering these cases against `buildSlotOptions`, `buildEndSlotOptions`, and `isDayBookable`.

No API changes needed.

---

### Step 4: Add a stale-availability warning and optional refresh

**File**: `webUI/components/public-space-detail-view.tsx`

The availability is fetched once on mount. If a user sits on the page for > ~2 minutes and another user books a slot, the UI still shows it as available. The server will reject with 409 on submit, but the user gets no warning.

Recommended approach:
1. Add a `lastFetchedAt` timestamp in component state.
2. Before the user clicks "Reserve & Pay" / "Request to Book", check if `Date.now() - lastFetchedAt > STALE_THRESHOLD` (e.g., 3 minutes).
3. If stale, re-fetch availability, update state, and re-validate the selected slot against the fresh data. If the selected slot is now taken, clear the selection and show a message: "Your selected time is no longer available. Please choose another."
4. Only submit if the refreshed data still shows the slot as free.

This eliminates the surprise 409 experience and gives the user actionable feedback.

No backend changes required. This is a frontend-only improvement.

---

### Step 5: Close the concurrency gap description (documentation only)

**File**: `backend/app/api/booking_requests.py:939–941`

The current `with_for_update()` lock on the Space row **does** prevent double-booking for the same space — two concurrent requests serialise at the lock. However, the comment in the code says "app-level checks deterministic" without explaining the full guarantee. Consider:

- Ensuring the `with_for_update()` lock is also acquired in the owner-approval path (`booking_requests.py:1428`). A check of that path shows `validate_occurrences_available` is called at line 1428, but the Space row lock (`with_for_update`) does **not** appear to be re-acquired there.

**Action**: In the approval handler (`PATCH /booking-requests/{public_id}` approval branch), add:
```python
db.query(Space).filter(Space.id == space.id).with_for_update().first()
```
before the `validate_occurrences_available()` call at line 1428, mirroring the creation path.

This closes a narrow window where two approval operations for the same space could race.

---

### Step 6: Optional — add a database-level exclusion constraint

For bulletproof double-booking prevention at the persistence layer (beyond the app lock), consider adding a PostgreSQL exclusion constraint on the `bookings` table:

```sql
ALTER TABLE bookings
ADD CONSTRAINT bookings_no_overlap
EXCLUDE USING gist (
  space_id WITH =,
  tstzrange(
    COALESCE(inventory_start_datetime, start_datetime),
    COALESCE(inventory_end_datetime, end_datetime)
  ) WITH &&
)
WHERE (status IN ('pending', 'confirmed'));
```

This requires the `btree_gist` extension. It makes double-booking impossible at the DB level regardless of application code, complementing the existing `IntegrityError` catch. This is the most robust long-term fix for the concurrency gap.

---

### Implementation Order

| Step | Effort | Risk | Priority |
|---|---|---|---|
| 2 — Replace legacy member widget | Small (swap component reference) | Low | **Do first** |
| 3 — Verify + test time-slot filtering | Small (tests only) | None | **Do first** |
| 4 — Stale-availability refresh | Medium (frontend state + re-validation) | Low | Do second |
| 1 — Extend `fully_blocked` for bookings | Small (server-side) | Low | Do second |
| 5 — Add lock to approval path | Small (1 line) | Low | Do second |
| 6 — DB exclusion constraint | Medium (migration + extension) | Medium (test in staging) | Do last |

---

## Open Questions

1. **`space-detail-view.tsx` usage**: Are there other routes or entry points (deep links, redirects) that render `SpaceDetailView` besides `/member/spaces/[spaceId]`? Confirm before removing it.
2. **Approval-path lock**: Verify the approval handler fully (lines 1390–1445 of `booking_requests.py`) to confirm `with_for_update()` is absent before adding it in Step 5.
3. **Mobile app**: Does the mobile client (`/mobile/`) call the availability endpoint and enforce slot filtering? Not investigated here; the same gap as the legacy web widget likely exists there.
4. **Lease widget availability**: `lease-booking-widget.tsx` uses a plain date input for move-in date with no availability check. If multiple members can hold an exclusive lease simultaneously, the server's `subscription_overlaps` check should block this — but the UX gives no pre-flight signal. Verify this is caught server-side before move-in date is committed.
5. **Buffer overlap in availability response**: `space_availability.py` uses `inventory_*` datetimes when querying bookings for the availability response (lines 42–43). This means a booking 10:00–11:00 with a 15-minute post-buffer will show a busy interval extending to 11:15. Verify this is intentional and that `buildSlotOptions` handles an interval start of 11:15 correctly with 30-minute granularity (it should snap to 11:30 via `findFirstSlotOnOrAfter`).

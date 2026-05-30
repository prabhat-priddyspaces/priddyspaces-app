# Booking Availability — Open Questions: Answers & Implementation Plan

> Companion to `BOOKING_AUDIT.md`. Each section resolves one open question
> with a concrete finding and ordered implementation steps.

---

## OQ1 — `space-detail-view.tsx`: Is it used anywhere besides `/member/spaces/[spaceId]`?

### Finding

**Only one consumer.** A full-repo grep confirms:

```
webUI/app/member/spaces/[spaceId]/page.tsx   ← sole import and render site
```

No other page, component, or test file imports `SpaceDetailView` from
`space-detail-view.tsx`. The `PublicSpaceDetailView` (the availability-aware
version) is used in tests (`tests/public-marketplace.test.tsx`) and the public
route (`app/spaces/[spaceId]/`).

### Implementation Steps

1. **Swap the component** in `webUI/app/member/spaces/[spaceId]/page.tsx`:

   ```diff
   -import { SpaceDetailView } from "@/components/space-detail-view";
   +import { PublicSpaceDetailView } from "@/components/public-space-detail-view";
   
    export default async function SpaceDetailPage({ params }) {
      const { spaceId } = await params;
   -  return <SpaceDetailView spaceId={spaceId} backHref="/member" />;
   +  return (
   +    <Suspense fallback={…}>
   +      <PublicSpaceDetailViewClient spaceId={spaceId} backHref="/member" />
   +    </Suspense>
   +  );
    }
   ```

   `PublicSpaceDetailView` is a `"use client"` component; wrap it in a
   thin client shell (identical pattern to `public-space-detail-client.tsx`)
   or extract the `spaceId` from `params` in a server component and pass it
   down as a prop.

2. **Delete** `webUI/components/space-detail-view.tsx` once the swap is
   confirmed green in CI.

3. **Update or delete the corresponding test** — there are no tests for
   `SpaceDetailView` directly; verify nothing in `webUI/tests/` references it.

4. **Smoke-test** the member space detail route end-to-end:
   - Verify the availability calendar renders and disables booked dates.
   - Verify the start/end time dropdowns show only free slots.
   - Verify submitting a booking still routes through `/api/booking-requests`.

---

## OQ2 — Approval-path lock: Is `with_for_update()` on the Space row present before `validate_occurrences_available()`?

### Finding

**Missing in both the approve and retry-payment handlers.**

| Code path | File:line | Space row lock before validate? |
|---|---|---|
| `POST /booking-requests` (create) | `booking_requests.py:941` | **Yes** — line 941 |
| `POST /booking-requests/{id}/approve` — charge-on-approval branch | `booking_requests.py:1249` | **No** — only the BookingRequest row is locked (line 1208) |
| `POST /booking-requests/{id}/approve` — non-charge branch | `booking_requests.py:1284` | **No** — same BookingRequest lock only |
| `POST /booking-requests/{id}/retry-payment` | `booking_requests.py:1428` | **No** — only BookingRequest row locked (line 1399) |

Two concurrent owner approvals for different requests on the same space could
both pass `validate_occurrences_available()` before either commits, leading to
a double-booking. This is the same class of race condition the creation path
already closes with the Space row lock.

### Implementation Steps

1. **Approve handler — charge-on-approval branch** (`booking_requests.py`):
   Add a Space row lock immediately before the `validate_occurrences_available`
   call at line 1249:

   ```python
   # before line 1249
   db.query(Space).filter(Space.id == space.id).with_for_update().first()
   validate_occurrences_available(
       db, space=space, location=location, occurrences=occurrences,
       ignore_booking_request_id=req.id,
   )
   ```

2. **Approve handler — non-charge branch** (line 1284): Same one-liner before
   the `validate_occurrences_available` call.

   ```python
   # before line 1284
   db.query(Space).filter(Space.id == space.id).with_for_update().first()
   validate_occurrences_available(
       db, space=space, location=location, occurrences=occurrences,
       ignore_booking_request_id=req.id,
   )
   ```

3. **Retry-payment handler** (line 1428): Same pattern.

   ```python
   # before line 1428
   db.query(Space).filter(Space.id == space.id).with_for_update().first()
   validate_occurrences_available(db, space=space, location=location, occurrences=occurrences)
   ```

4. **Add a backend test** in `backend/tests/` (or the existing booking request
   test module) that simulates two concurrent approvals for the same space/time
   and asserts exactly one succeeds with 200 and the other fails with 409.

---

## OQ3 — Mobile app: Does it call the availability endpoint and enforce slot filtering?

### Finding

**No. The mobile booking screen has the same gap as the legacy web widget.**

`mobile/src/screens/member/SpaceDetailScreen.tsx`:

- Fetches `GET /api/spaces/{id}` (internal space endpoint) — NOT the marketplace
  availability endpoint.
- `buildTimeOptions(space)` (line 73–81) generates 30-minute slots between
  `availability_start_time` and `availability_end_time` directly from space
  metadata. No `busy_intervals` involved.
- The date picker shows the next 7 days as fixed chips (line 66–70). All dates
  are shown; none are disabled based on bookings.
- Time chips filter only by `option + 30 ≤ close_time` (line 279) — a static
  boundary check, not a conflict check.

The server still enforces conflicts (409 on submit), but the mobile UX is
completely blind to existing bookings before submission.

### Implementation Steps

1. **Fetch the availability API on screen mount** alongside the existing space
   fetch. Add to the `Promise.all` in the `useEffect` at line 106:

   ```typescript
   const today = toDateIso(new Date());
   const to = toDateIso(new Date(Date.now() + 14 * 86400_000));
   apiFetch<SpaceAvailabilityResponse>(
     `/api/marketplace/spaces/${encodeURIComponent(spaceId)}/availability?from=${today}&to=${to}`,
     { method: "GET" }, token
   ).catch(() => null),
   ```

   Add a `SpaceAvailabilityResponse` type that mirrors the web's
   `lib/public-marketplace.ts` shape (or extract it to a shared package).

2. **Port the availability utility functions** from
   `webUI/lib/space-availability.ts` into
   `mobile/src/lib/space-availability.ts`:
   - `getOpenIntervalsForDay(day, open)`
   - `isDayBookable(day, open, granularityMinutes)`
   - `buildSlotOptions(intervals, granularityMinutes)`
   - `buildEndSlotOptions(intervals, startTime, granularityMinutes)`

   These are pure TypeScript with no DOM or Next.js dependencies; they can be
   copied verbatim.

3. **Filter the date chips**: Replace the unconditional 7-day array with chips
   that are disabled (greyed-out, non-pressable) when `isDayBookable` returns
   `false` for that date.

4. **Filter the start/end time chips**: Replace `buildTimeOptions(space)` with
   `buildSlotOptions(getOpenIntervalsForDay(selectedDay, openWindow), granularity)`
   for start, and `buildEndSlotOptions(...)` for end. The selected day comes
   from the availability response; the open window from
   `availability_start_time`/`availability_end_time`.

5. **Add mobile tests** in `mobile/__tests__/` for the availability logic and
   the screen rendering (date chip disabled state, time chip filtered state).

---

## OQ4 — Lease widget: Is the move-in date conflict caught server-side?

### Finding

**Partially — via plan capacity limit, not a date-range overlap check.**

`_create_membership_purchase_request` (`booking_requests.py:543`):
- Checks `plan.max_active_subscriptions` (line 575–585): if the number of
  active subscriptions for the plan has reached the max, it returns 409 "This
  plan is sold out."
- Does **not** call `subscription_overlaps()` or any date-range overlap check.

`_approve_membership_request` (`booking_requests.py:457`):
- Creates a `Subscription` record with `start_date = desired_start_date` and
  `end_date = start + commitment_months`.
- Does **not** check whether an existing active subscription already covers
  that date range for the same space.

**Consequence**: For private office/suite leases where `max_active_subscriptions = 1`,
the capacity check gives partial protection — a second lease request is
blocked only once the first subscription is in `active` or `past_due` status.
During the gap between request submission and approval (before the subscription
is created), a second lease request for the same dates can be submitted and
also approved, creating two overlapping subscriptions.

Additionally, if subscription A ends on 2026-07-01 and subscription B starts
on 2026-08-01, both are allowed (different active periods), which is correct
for non-overlapping leases. The missing protection is for genuinely overlapping
date ranges.

### Implementation Steps

1. **Add a date-range subscription overlap check** in
   `_create_membership_purchase_request` (before creating the
   `BookingRequest` record, around line 609):

   ```python
   from app.services.availability import subscription_overlaps
   if subscription_overlaps(db, space.id, desired_start, commitment_end):
       raise HTTPException(status_code=409, detail="Space already leased for that period")
   ```

   `subscription_overlaps` already handles the date-range logic correctly
   (`availability.py:49`).

2. **Add the same check in `_approve_membership_request`** (before creating
   the `Subscription` record, around line 497), ignoring the current
   request's own eventual subscription to avoid self-conflict:

   ```python
   if subscription_overlaps(db, req.space_id, desired_start, commitment_end):
       raise HTTPException(status_code=409, detail="Space already leased for that period")
   ```

3. **Add a Space row lock** in the approval path before both checks (same
   pattern as OQ2), to serialise concurrent approvals for the same space.

4. **Frontend signal for the lease widget** (`webUI/components/lease-booking-widget.tsx`):
   The widget uses a plain `<input type="date">` for move-in date with no
   pre-flight availability check. Add a read-only display of the space's
   occupancy status (e.g., "Next available from YYYY-MM-DD") by calling the
   availability endpoint and scanning for `fully_blocked` days. This is a UX
   enhancement — the server-side fix in steps 1–2 is the safety net.

5. **Backend test**: Submit two lease requests for the same space/dates
   concurrently; assert exactly one is approvable and the second returns 409.

---

## OQ5 — Buffer overlap: Does `buildSlotOptions` handle non-aligned interval starts?

### Finding

**Bug confirmed.** `buildSlotOptions` does not snap to the next
granularity-aligned boundary.

Example: space open 09:00–18:00, granularity 30 min, booking 10:00–11:00
with a 15-minute post-buffer.

1. `space_availability.py` emits `busy_intervals: [{start:"10:00", end:"11:15"}]`
   (uses `inventory_end_datetime`).
2. `getOpenIntervalsForDay` returns free windows: `[{start:"09:00", end:"10:00"}, {start:"11:15", end:"18:00"}]`.
3. `buildSlotOptions` (`space-availability.ts:136`) iterates:
   ```
   t = 675 (11:15)  → push "11:15"
   t = 705 (11:45)  → push "11:45"
   t = 735 (12:15)  → push "12:15"
   ...
   ```
   **"11:15" appears as a selectable start time** but is not aligned to 30-min
   boundaries from 09:00 (valid set: …, 10:30, 11:00, 11:30, 12:00, …).

4. The server rejects "11:15" with HTTP 400 "Start time must align to booking
   granularity" (`booking_inventory.py:185–186`).

The user selects 11:15, submits, gets a confusing 400 error.

### Implementation Steps

1. **Fix `buildSlotOptions`** (`webUI/lib/space-availability.ts:136`) to snap
   the starting `t` to the next aligned boundary:

   ```typescript
   export function buildSlotOptions(
     intervals: OpenInterval[],
     granularityMinutes: number,
     openStartMinutes: number,  // add this parameter (= timeToMinutes(open.start))
   ): string[] {
     const slots: string[] = [];
     for (const interval of intervals) {
       const rawStart = timeToMinutes(interval.start);
       const end = timeToMinutes(interval.end);
       // Snap rawStart up to the next boundary aligned to openStart
       const offset = (rawStart - openStartMinutes) % granularityMinutes;
       const alignedStart = offset === 0
         ? rawStart
         : rawStart + (granularityMinutes - offset);
       for (let t = alignedStart; t + granularityMinutes <= end; t += granularityMinutes) {
         slots.push(minutesToTime(t));
       }
     }
     return slots;
   }
   ```

2. **Update all call sites** of `buildSlotOptions` to pass `openStartMinutes`:
   - `webUI/components/public-space-detail-view.tsx:217`
   - Any future mobile port (OQ3 step 2).

3. **Fix `buildEndSlotOptions`** similarly — when the `containing` interval
   starts at a non-aligned boundary, the end options computed from
   `startMinutes + granularity` are still correct (they're relative to the
   user-selected start), so no change needed there. But verify that the
   containing-interval lookup still works when `interval.start` is non-aligned
   (it does — the lookup is `start <= startMinutes < end`, which is unaffected).

4. **Add unit tests** in `webUI/tests/` (or alongside `space-availability.ts`)
   for the buffer-alignment scenario:
   ```
   open: 09:00–18:00, granularity: 30, busyIntervals: [{start:"10:00", end:"11:15"}]
   → buildSlotOptions result must NOT include "11:15"
   → must include "11:30"
   ```

5. **Backend — no change needed.** The server already rejects misaligned times
   with 400. This is purely a frontend fix to prevent offering non-aligned
   options.

---

## Summary Table

| OQ | Finding | Fix Complexity | Files Changed |
|---|---|---|---|
| OQ1 — Legacy web widget | `SpaceDetailView` has exactly one consumer; safe to delete | Small | `webUI/app/member/spaces/[spaceId]/page.tsx`, delete `space-detail-view.tsx` |
| OQ2 — Approval-path lock | Space row lock missing before 3 `validate_occurrences_available` calls | Small (3 lines) | `backend/app/api/booking_requests.py` |
| OQ3 — Mobile availability | Mobile `SpaceDetailScreen` has no availability fetch or slot filtering | Medium | `mobile/src/screens/member/SpaceDetailScreen.tsx`, new `mobile/src/lib/space-availability.ts` |
| OQ4 — Lease date conflict | No date-range overlap check in lease request or approval path | Small–Medium | `backend/app/api/booking_requests.py` (2 places), `webUI/components/lease-booking-widget.tsx` |
| OQ5 — Buffer slot alignment | `buildSlotOptions` exposes non-granularity-aligned start times when buffer creates a non-aligned interval boundary | Small | `webUI/lib/space-availability.ts`, update call sites |

### Recommended Order

```
1. OQ2 — Add 3 Space row locks (backend, 3 lines, closes a real concurrency hole)
2. OQ5 — Fix buildSlotOptions alignment (frontend, 1 function, avoids misleading 400s)
3. OQ1 — Swap legacy web widget (frontend, component swap + delete)
4. OQ4 — Add lease date-range overlap check (backend + frontend UX signal)
5. OQ3 — Mobile availability (most work; needs porting utility functions)
```

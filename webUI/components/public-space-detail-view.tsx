"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Gift,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { buildLoginHref } from "@/lib/auth-redirect";
import { formatUsd, moneyToNumber } from "@/lib/money";
import {
  formatLocationAddress,
  formatSpaceTypeLabel,
  leaseBookingModeForSpaceType,
  markLeaseEstimate,
  MembershipPlanPublic,
  MarketplaceSpaceDetailResponse,
  SpaceAvailabilityResponse,
} from "@/lib/public-marketplace";
import { LeaseBookingWidget } from "@/components/lease-booking-widget";
import { CheckoutSummaryModal } from "@/components/checkout-summary-modal";
import { PublicImageWithFallback } from "@/components/public-image-with-fallback";
import { PublicTopbar } from "@/components/public-topbar";
import {
  DEFAULT_GRANULARITY_MINUTES,
  addDaysIso,
  buildEndSlotOptions,
  buildSlotOptions,
  findFirstBookableDay,
  findFirstSlotOnOrAfter,
  formatTimeLabel,
  getDayOpenWindow,
  getOpenIntervalsForDay,
  isDayBookable,
  minutesToTime,
  nowTimeInZone,
  timeToMinutes,
  todayIso,
  todayIsoInZone,
  zonedDateTimeToUtc,
} from "@/lib/space-availability";
import { AvailabilityCalendar } from "@/components/availability-calendar";
import { PublicLocationMiniMap } from "@/components/public-location-mini-map";
import { PaymentMethodModal } from "@/components/payment-method-modal";
import { GuestCheckoutModal } from "@/components/guest-checkout-modal";
import { PublicWorkingHours } from "@/components/public-working-hours";
import type { LoyaltyRedemptionLock, LoyaltyRedemptionPreview } from "@/lib/loyalty";
import { formatCents, formatPoints } from "@/lib/loyalty";

const AVAILABILITY_RANGE_DAYS = 60;
const AVAILABILITY_STALE_MS = 3 * 60 * 1000;

interface PublicSpaceDetailViewProps {
  spaceId: string;
  backHref: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialPlanPublicId?: string;
  initialMoveInDate?: string;
  initialWaitlistPublicId?: string;
  selfHrefBase?: string;
}

interface PaymentMethodResolve {
  is_configured: boolean;
  has_payment_method: boolean;
  payment_method_public_id: string | null;
  message: string | null;
}

interface ReservationPayload {
  space_public_id: string;
  start_datetime: string;
  end_datetime: string;
  booking_mode: "hourly" | "day_pass";
  full_day: boolean;
  seats_requested?: number;
}

function membershipBookingModeForSpaceType(spaceType: string) {
  if (spaceType === "shared_desk") return "monthly_membership";
  if (spaceType === "virtual_office") return "virtual_membership";
  return null;
}

function buildDirectionsHref(address: string, lat: number | null, lng: number | null) {
  const query = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildInitials(name: string) {
  const parts = name.split(" ").filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "VX";
}

function getPriceRows(space: MarketplaceSpaceDetailResponse["space"]) {
  const rows: Array<{ label: string; value: string }> = [];
  const productPrices = space.booking_products ?? [];
  const firstPlan = productPrices
    .filter((product) => product.price_cents != null)
    .sort((a, b) => (a.price_cents ?? 0) - (b.price_cents ?? 0))[0];

  if (space.space_type === "conference_room") {
    if (space.hourly_price != null) rows.push({ label: "Hourly", value: formatUsd(space.hourly_price, "/hour") });
    if (space.price_daily != null) rows.push({ label: "Day Rate", value: formatUsd(space.price_daily, "/day") });
    return rows;
  }
  if (space.space_type === "shared_desk") {
    if (space.price_daily != null) rows.push({ label: "Day Pass", value: formatUsd(space.price_daily, "/day") });
    if (space.membership_price != null) rows.push({ label: "Membership", value: formatUsd(space.membership_price, "/month") });
    return rows;
  }
  if (space.space_type === "virtual_office") {
    if (space.membership_price != null) rows.push({ label: "Virtual Membership", value: formatUsd(space.membership_price, "/month") });
    return rows;
  }
  if (firstPlan?.price_cents != null) {
    rows.push({
      label: "Lease",
      value: markLeaseEstimate(formatCents(firstPlan.price_cents) + "/month"),
    });
  } else if (space.membership_price != null) {
    rows.push({
      label: "Lease",
      value: markLeaseEstimate(formatUsd(space.membership_price, "/month")),
    });
  }
  return rows;
}

export function PublicSpaceDetailView({
  spaceId,
  backHref,
  initialDate = "",
  initialStartTime = "",
  initialEndTime = "",
  initialPlanPublicId,
  initialMoveInDate,
  initialWaitlistPublicId,
  selfHrefBase = "/spaces",
}: PublicSpaceDetailViewProps) {
  const router = useRouter();
  const isAuthenticated = Boolean(getAccessToken());
  const [detail, setDetail] = useState<MarketplaceSpaceDetailResponse | null>(null);
  const [availability, setAvailability] = useState<SpaceAvailabilityResponse | null>(null);
  const [availabilityFetchedAt, setAvailabilityFetchedAt] = useState<number | null>(null);
  const [plans, setPlans] = useState<MembershipPlanPublic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [allDay, setAllDay] = useState(false);
  const [autoFilled, setAutoFilled] = useState(Boolean(initialDate));
  const [requesting, setRequesting] = useState(false);
  const [selectedMembershipPlanId, setSelectedMembershipPlanId] = useState("");
  const [membershipStartDate, setMembershipStartDate] = useState(initialMoveInDate || todayIso());
  const [pendingMembershipPlan, setPendingMembershipPlan] = useState<MembershipPlanPublic | null>(null);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<ReservationPayload | null>(null);
  const [checkoutReservation, setCheckoutReservation] = useState<ReservationPayload | null>(null);
  const [checkoutMembershipPlan, setCheckoutMembershipPlan] = useState<MembershipPlanPublic | null>(null);
  const [checkoutSubmitting, setCheckoutSubmitting] = useState(false);
  const [authorizationConsent, setAuthorizationConsent] = useState(false);
  const [seatQuantity, setSeatQuantity] = useState("1");
  const [guestCheckoutOpen, setGuestCheckoutOpen] = useState(false);
  const [guestPayload, setGuestPayload] = useState<ReservationPayload | null>(null);
  const [loyaltyPreview, setLoyaltyPreview] = useState<LoyaltyRedemptionPreview | null>(null);
  const [priddyPoints, setPriddyPoints] = useState("");
  const [ownerPoints, setOwnerPoints] = useState("");
  const [loyaltyLoading, setLoyaltyLoading] = useState(false);

  const fetchAndStoreAvailability = useCallback(async () => {
    const fromIso = todayIso();
    const toIso = addDaysIso(fromIso, AVAILABILITY_RANGE_DAYS);
    const response = await apiFetch<SpaceAvailabilityResponse>(
      `/api/marketplace/spaces/${encodeURIComponent(spaceId)}/availability?from=${fromIso}&to=${toIso}`,
      { method: "GET" },
    );
    setAvailability(response);
    setAvailabilityFetchedAt(Date.now());
    return response;
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) {
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch<MarketplaceSpaceDetailResponse>(`/api/marketplace/spaces/${spaceId}`, { method: "GET" }),
      apiFetch<MembershipPlanPublic[]>(
        `/api/membership-plans/public?space_public_id=${encodeURIComponent(spaceId)}`,
        { method: "GET" },
      ).catch(() => []),
      fetchAndStoreAvailability().catch(() => null),
    ])
      .then(([detailResponse, planResponse, availabilityResponse]) => {
        setDetail(detailResponse);
        setPlans(planResponse);
        const initialMembershipPlan = initialPlanPublicId
          ? planResponse.find((plan) => plan.public_id === initialPlanPublicId)
          : null;
        const firstMembershipPlan = initialMembershipPlan ?? planResponse.find((plan) =>
          ["monthly_membership", "virtual_membership"].includes(plan.booking_mode),
        );
        setSelectedMembershipPlanId(firstMembershipPlan?.public_id ?? "");
        if (!availabilityResponse) {
          setAvailability(null);
          setAvailabilityFetchedAt(null);
        }
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load listing");
        setDetail(null);
        setPlans([]);
        setAvailability(null);
      })
      .finally(() => setLoading(false));
  }, [fetchAndStoreAvailability, initialPlanPublicId, spaceId]);

  const granularity =
    availability?.granularity_minutes ?? DEFAULT_GRANULARITY_MINUTES;
  const openWindow = useMemo(
    () =>
      getDayOpenWindow({
        availability_start_time:
          availability?.availability_start_time ??
          detail?.space.availability_start_time ??
          null,
        availability_end_time:
          availability?.availability_end_time ??
          detail?.space.availability_end_time ??
          null,
      }),
    [availability, detail],
  );

  const dayMap = useMemo(() => {
    const map = new Map<string, NonNullable<typeof availability>["days"][number]>();
    const days = Array.isArray(availability?.days) ? availability!.days : [];
    for (const d of days) map.set(d.date, d);
    return map;
  }, [availability]);

  const selectedDay = date ? dayMap.get(date) : undefined;
  const selectedDayIntervals = useMemo(
    () => getOpenIntervalsForDay(selectedDay, openWindow),
    [selectedDay, openWindow],
  );
  const startSlotOptions = useMemo(
    () => buildSlotOptions(selectedDayIntervals, granularity, openWindow.start),
    [selectedDayIntervals, granularity, openWindow.start],
  );
  const endSlotOptions = useMemo(
    () => buildEndSlotOptions(selectedDayIntervals, startTime, granularity),
    [selectedDayIntervals, startTime, granularity],
  );

  useEffect(() => {
    if (!availability || autoFilled) return;
    const tz = availability.timezone || "UTC";
    const todayLocal = todayIsoInZone(tz);
    const todayDay = dayMap.get(todayLocal);
    let pickedDate: string | null = null;
    let pickedStart: string | null = null;

    if (todayDay && isDayBookable(todayDay, openWindow, granularity)) {
      const intervals = getOpenIntervalsForDay(todayDay, openWindow);
      const slot = findFirstSlotOnOrAfter(intervals, granularity, nowTimeInZone(tz), openWindow.start);
      if (slot) {
        pickedDate = todayLocal;
        pickedStart = slot.start;
      }
    }

    if (!pickedDate) {
      const nextDay = findFirstBookableDay(
        availability.days,
        openWindow,
        granularity,
        todayLocal,
      );
      if (nextDay) {
        pickedDate = nextDay.date;
        const intervals = getOpenIntervalsForDay(nextDay, openWindow);
        const slot = findFirstSlotOnOrAfter(intervals, granularity, openWindow.start, openWindow.start);
        pickedStart = slot?.start ?? intervals[0]?.start ?? null;
      }
    }

    if (pickedDate && pickedStart) {
      setDate(pickedDate);
      setStartTime(pickedStart);
      setEndTime(minutesToTime(timeToMinutes(pickedStart) + granularity));
    }
    setAutoFilled(true);
  }, [availability, autoFilled, dayMap, openWindow, granularity]);

  useEffect(() => {
    if (allDay) return;
    if (!startTime || !date) return;
    const startMins = timeToMinutes(startTime);
    if (
      endTime &&
      timeToMinutes(endTime) > startMins &&
      endSlotOptions.includes(endTime)
    ) {
      return;
    }
    const fallback =
      endSlotOptions.find((opt) => timeToMinutes(opt) > startMins) ?? null;
    if (fallback) setEndTime(fallback);
  }, [allDay, startTime, endTime, endSlotOptions, date]);

  const images = detail?.images ?? [];
  const heroImage = images[0] ?? null;
  const galleryImages = heroImage ? images.slice(1, 5) : images.slice(0, 4);
  const priceRows = useMemo(() => (detail ? getPriceRows(detail.space) : []), [detail]);
  const primaryPrice = priceRows[0]?.value ?? "Contact for pricing";
  const locationAddress = detail ? formatLocationAddress(detail.location) : "";
  const organizationName = detail?.location.organization_name?.trim() || null;
  const chargeOwnerName = organizationName || "this owner";
  const leaseBookingMode = detail
    ? leaseBookingModeForSpaceType(detail.space.space_type)
    : null;
  const membershipBookingMode = detail
    ? membershipBookingModeForSpaceType(detail.space.space_type)
    : null;
  const isConferenceRoom = detail?.space.space_type === "conference_room";
  const isSharedDesk = detail?.space.space_type === "shared_desk";
  const isVirtualOffice = detail?.space.space_type === "virtual_office";
  const membershipPlans = useMemo(
    () => plans.filter((plan) => membershipBookingMode && plan.booking_mode === membershipBookingMode),
    [membershipBookingMode, plans],
  );
  const selectedMembershipPlan = useMemo(
    () =>
      membershipPlans.find((plan) => plan.public_id === selectedMembershipPlanId) ??
      membershipPlans[0] ??
      null,
    [membershipPlans, selectedMembershipPlanId],
  );

  const hourlyPrice =
    availability?.hourly_price ?? detail?.space.hourly_price ?? null;
  const dailyPrice =
    availability?.daily_price ?? detail?.space.price_daily ?? null;
  const waitlistEnabled = Boolean(detail?.location.waitlist_enabled || availability?.waitlist_enabled);
  const hourlyAmount = moneyToNumber(hourlyPrice);
  const dailyAmount = moneyToNumber(dailyPrice);
  const conferenceDayRateAvailable = isConferenceRoom && dailyAmount != null;

  useEffect(() => {
    if (isSharedDesk) setAllDay(true);
    if (isConferenceRoom) setAllDay(false);
  }, [isConferenceRoom, isSharedDesk]);

  const dayOpenSpan = useMemo(() => {
    if (!selectedDay) return null;
    const start = timeToMinutes(openWindow.start);
    const end = timeToMinutes(openWindow.end);
    return end > start ? (end - start) / 60 : null;
  }, [selectedDay, openWindow]);

  const dayHasConflict = useMemo(() => {
    if (!selectedDay) return false;
    if (selectedDay.fully_blocked) return true;
    return (selectedDay.busy_intervals ?? []).some((b) => {
      const bs = Math.max(timeToMinutes(b.start), timeToMinutes(openWindow.start));
      const be = Math.min(timeToMinutes(b.end), timeToMinutes(openWindow.end));
      return be > bs;
    });
  }, [selectedDay, openWindow]);

  const allDayDisabled = !selectedDay || dayHasConflict || dayOpenSpan == null;
  const selectedSeatCapacity = isSharedDesk
    ? selectedDay?.capacity ?? detail?.space.capacity ?? 1
    : null;
  const selectedRemainingSeats = isSharedDesk
    ? selectedDay?.remaining_seats ?? selectedSeatCapacity ?? 1
    : null;
  const maxSeatQuantity = isSharedDesk
    ? Math.max(0, selectedRemainingSeats ?? selectedSeatCapacity ?? 1)
    : 1;
  const seatAvailabilityText = isSharedDesk
    ? maxSeatQuantity <= 0
      ? "Sold out for the selected day."
      : `${maxSeatQuantity} ${maxSeatQuantity === 1 ? "seat" : "seats"} available for the selected day.`
    : null;

  useEffect(() => {
    if (allDay && allDayDisabled && !(isSharedDesk && waitlistEnabled)) {
      setAllDay(false);
    }
  }, [allDay, allDayDisabled, isSharedDesk, waitlistEnabled]);

  useEffect(() => {
    if (!isSharedDesk) return;
    if (maxSeatQuantity <= 0) {
      setSeatQuantity("1");
      return;
    }
    const requested = Math.max(1, Number(seatQuantity || 1));
    if (!Number.isFinite(requested) || requested > maxSeatQuantity) {
      setSeatQuantity(String(maxSeatQuantity));
    }
  }, [isSharedDesk, maxSeatQuantity, seatQuantity]);

  const hours = useMemo(() => {
    if (allDay) return dayOpenSpan ?? 0;
    if (!startTime || !endTime) return 0;
    const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
    return diff > 0 ? diff / 60 : 0;
  }, [allDay, dayOpenSpan, startTime, endTime]);

  const volumeDiscounts = useMemo(() => detail?.space.volume_discounts ?? [], [detail?.space.volume_discounts]);
  const bookingQuantity = isSharedDesk
    ? Math.min(
        Math.max(1, Number(seatQuantity || 1)),
        Math.max(1, maxSeatQuantity || 1),
      )
    : 1;

  const breakdown = useMemo(() => {
    if (allDay) {
      // Full-day: flat day rate, no volume discount.
      if (dailyAmount != null) {
        return {
          base: dailyAmount * bookingQuantity,
          discountPercent: 0,
          discountAmount: 0,
          total: dailyAmount * bookingQuantity,
          basis: "daily" as const,
          units: bookingQuantity,
        };
      }
      if (hourlyAmount != null && dayOpenSpan != null) {
        const base = hourlyAmount * dayOpenSpan;
        return { base, discountPercent: 0, discountAmount: 0, total: base, basis: "hourly_day_span" as const, units: dayOpenSpan };
      }
      return null;
    }
    if (hourlyAmount == null || hours <= 0) return null;
    const baseHourly = hourlyAmount * hours;
    // Auto-cap to daily.
    if (dailyAmount != null && baseHourly > dailyAmount) {
      return {
        base: dailyAmount,
        discountPercent: 0,
        discountAmount: 0,
        total: dailyAmount,
        basis: "capped_to_daily" as const,
        units: 1,
      };
    }
    // Pick best applicable volume tier.
    const eligible = volumeDiscounts.filter(
      (t) => hours >= t.min_hours && t.discount_percent > 0 && t.discount_percent < 100
    );
    const best = eligible.reduce<{ percent: number } | null>((acc, t) => {
      if (!acc || t.discount_percent > acc.percent) return { percent: t.discount_percent };
      return acc;
    }, null);
    const discountPercent = best?.percent ?? 0;
    const discountAmount = Math.round(baseHourly * (discountPercent / 100));
    return {
      base: baseHourly,
      discountPercent,
      discountAmount,
      total: baseHourly - discountAmount,
      basis: "hourly" as const,
      units: hours,
    };
  }, [allDay, bookingQuantity, dailyAmount, hourlyAmount, dayOpenSpan, hours, volumeDiscounts]);

  const bufferBefore = availability?.buffer_before_minutes ?? detail?.space.buffer_before_minutes ?? 0;
  const bufferAfter = availability?.buffer_after_minutes ?? detail?.space.buffer_after_minutes ?? 0;
  const cancellationTiers = detail?.cancellation_policy?.tiers ?? [];
  const cancellationTierText = cancellationTiers.length > 0
    ? cancellationTiers
        .slice()
        .sort((a, b) => b.min_hours_before_start - a.min_hours_before_start)
        .map((tier) => `${tier.refund_percent}% refund ${tier.min_hours_before_start}+h before`)
        .join(" · ")
    : detail?.cancellation_policy
      ? `${detail.cancellation_policy.refund_percent}% refund ${detail.cancellation_policy.cancel_window_hours}+h before`
      : null;
  const autoApproval = detail?.location.booking_approval_mode === "auto";
  const membershipLeaseAutoApproval = detail?.location.membership_lease_approval_mode === "auto";
  const reserveActionLabel = leaseBookingMode
    ? membershipLeaseAutoApproval
      ? "Reserve & Pay"
      : "Request to Book"
    : autoApproval
      ? "Reserve & Pay"
      : "Request to book";
  const authorizationText = autoApproval
    ? `I authorize ${chargeOwnerName} to charge my card now for this booking.`
    : `I authorize ${chargeOwnerName} to charge my card if this booking is approved.`;

  function buildSelfNextHref(extra?: { planPublicId?: string | null; moveInDate?: string }) {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (startTime) params.set("start_time", startTime);
    if (endTime) params.set("end_time", endTime);
    if (extra?.planPublicId) params.set("plan", extra.planPublicId);
    if (extra?.moveInDate) params.set("move_in", extra.moveInDate);
    if (initialWaitlistPublicId) params.set("waitlist", initialWaitlistPublicId);
    const qs = params.toString();
    return qs ? `${selfHrefBase}/${spaceId}?${qs}` : `${selfHrefBase}/${spaceId}`;
  }

  const currentReservationPayload = useCallback((): ReservationPayload | null => {
    if (!detail || !date) return null;
    const effectiveStart = allDay ? openWindow.start : startTime;
    const effectiveEnd = allDay ? openWindow.end : endTime;
    if (!effectiveStart || !effectiveEnd) return null;
    const locationTimezone = detail.location.timezone || availability?.timezone || "UTC";
    const start = zonedDateTimeToUtc(date, effectiveStart, locationTimezone);
    const end = zonedDateTimeToUtc(date, effectiveEnd, locationTimezone);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return null;
    }
    return {
      space_public_id: detail.space.public_id,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      booking_mode: allDay ? "day_pass" : "hourly",
      full_day: allDay,
      seats_requested: isSharedDesk ? Math.max(1, Number(seatQuantity || 1)) : 1,
    };
  }, [
    allDay,
    availability?.timezone,
    date,
    detail,
    endTime,
    openWindow.end,
    openWindow.start,
    seatQuantity,
    isSharedDesk,
    startTime,
  ]);

  function selectedWindowAvailableIn(response: SpaceAvailabilityResponse): boolean {
    if (!date) return false;
    const freshDay = response.days.find((day) => day.date === date);
    if (!freshDay) return false;
    const freshGranularity = response.granularity_minutes ?? DEFAULT_GRANULARITY_MINUTES;
    const freshOpen = getDayOpenWindow({
      availability_start_time:
        response.availability_start_time ??
        detail?.space.availability_start_time ??
        null,
      availability_end_time:
        response.availability_end_time ??
        detail?.space.availability_end_time ??
        null,
    });
    const openStart = timeToMinutes(freshOpen.start);
    const openEnd = timeToMinutes(freshOpen.end);
    if (openEnd <= openStart) return false;
    if (allDay) {
      if (freshDay.fully_blocked) return false;
      if (isSharedDesk && freshDay.remaining_seats != null) {
        const requestedSeats = Math.max(1, Number(seatQuantity || 1));
        if (requestedSeats > freshDay.remaining_seats) return false;
      }
      return !(freshDay.busy_intervals ?? []).some((busy) => {
        const busyStart = Math.max(timeToMinutes(busy.start), openStart);
        const busyEnd = Math.min(timeToMinutes(busy.end), openEnd);
        return busyEnd > busyStart;
      });
    }
    if (!startTime || !endTime) return false;
    const intervals = getOpenIntervalsForDay(freshDay, freshOpen);
    const freshStartOptions = buildSlotOptions(intervals, freshGranularity, freshOpen.start);
    const freshEndOptions = buildEndSlotOptions(intervals, startTime, freshGranularity);
    return freshStartOptions.includes(startTime) && freshEndOptions.includes(endTime);
  }

  async function ensureAvailabilityCurrent(options?: { silentUnavailable?: boolean }): Promise<boolean> {
    const stale =
      availabilityFetchedAt == null ||
      Date.now() - availabilityFetchedAt > AVAILABILITY_STALE_MS;
    const current = stale ? await fetchAndStoreAvailability() : availability;
    if (!current || selectedWindowAvailableIn(current)) {
      return true;
    }
    if (!options?.silentUnavailable) {
      setAllDay(false);
      setStartTime("");
      setEndTime("");
      setAutoFilled(true);
      setError("That time is no longer available. Choose another date or time.");
    }
    return false;
  }

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    const payload = currentReservationPayload();
    if (!token || !payload || leaseBookingMode) {
      setLoyaltyPreview(null);
      setPriddyPoints("");
      setOwnerPoints("");
      return;
    }
    let active = true;
    setLoyaltyLoading(true);
    apiFetch<LoyaltyRedemptionPreview>(
      "/api/loyalty/redemptions/preview",
      { method: "POST", body: JSON.stringify(payload) },
      token,
    )
      .then((preview) => {
        if (!active) return;
        setLoyaltyPreview(preview);
        setPriddyPoints((current) => {
          if (current) {
            const parsed = Number(current);
            if (Number.isFinite(parsed) && parsed > preview.priddy.max_redeemable_points) {
              return String(preview.priddy.max_redeemable_points);
            }
            return current;
          }
          return preview.priddy.eligible && preview.priddy.max_redeemable_points > 0
            ? String(preview.priddy.max_redeemable_points)
            : "";
        });
        setOwnerPoints((current) => {
          if (current) {
            const parsed = Number(current);
            if (Number.isFinite(parsed) && parsed > preview.owner.max_redeemable_points) {
              return String(preview.owner.max_redeemable_points);
            }
            return current;
          }
          return preview.owner.eligible && preview.owner.max_redeemable_points > 0
            ? String(preview.owner.max_redeemable_points)
            : "";
        });
      })
      .catch(() => {
        if (active) setLoyaltyPreview(null);
      })
      .finally(() => {
        if (active) setLoyaltyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentReservationPayload, leaseBookingMode]);

  async function createLoyaltyLock(payload: ReservationPayload): Promise<string | null> {
    const token = getAccessToken() ?? undefined;
    const priddyRequested = Math.max(0, Number(priddyPoints || 0));
    const ownerRequested = Math.max(0, Number(ownerPoints || 0));
    if (!token || !loyaltyPreview?.eligible || priddyRequested + ownerRequested <= 0) return null;
    const lock = await apiFetch<LoyaltyRedemptionLock>(
      "/api/loyalty/redemptions/lock",
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          priddy_points_requested: priddyRequested,
          owner_points_requested: ownerRequested,
        }),
      },
      token,
    );
    return lock.public_id;
  }

  async function submitReservation(payload: ReservationPayload, paymentMethodPublicId: string | null) {
    const token = getAccessToken() ?? undefined;
    if (!token) {
      router.push(buildLoginHref(buildSelfNextHref()));
      return;
    }
    setRequesting(true);
    setError("");
    try {
      const redemptionLockPublicId = await createLoyaltyLock(payload);
      await apiFetch(
        "/api/booking-requests",
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
            redemption_lock_public_id: redemptionLockPublicId,
            source_waitlist_public_id: initialWaitlistPublicId || undefined,
          }),
        },
        token,
      );
      await fetchAndStoreAvailability().catch(() => null);
      router.push("/member/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setRequesting(false);
    }
  }

  async function submitWaitlist(payload: ReservationPayload) {
    const token = getAccessToken() ?? undefined;
    if (!token) {
      router.push(buildLoginHref(buildSelfNextHref()));
      return;
    }
    setRequesting(true);
    setError("");
    try {
      await apiFetch(
        "/api/booking-waitlist",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        token,
      );
      router.push("/member/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not join waitlist");
    } finally {
      setRequesting(false);
    }
  }

  async function continueReservationAfterSummary(payload: ReservationPayload) {
    const token = getAccessToken() ?? undefined;
    setCheckoutSubmitting(true);
    setCheckoutReservation(null);
    if (!token) {
      setGuestPayload(payload);
      setGuestCheckoutOpen(true);
      setCheckoutSubmitting(false);
      return;
    }
    setRequesting(true);
    setError("");
    try {
      if (pointsCoverTotal) {
        await submitReservation(payload, null);
        return;
      }
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(payload.space_public_id)}`,
        { method: "GET" },
        token,
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || `${chargeOwnerName === "this owner" ? "This owner" : chargeOwnerName} has not configured payments.`);
      }
      if (!resolved.has_payment_method || !resolved.payment_method_public_id) {
        setPendingReservation(payload);
        setPaymentMethodOpen(true);
        return;
      }
      await submitReservation(payload, resolved.payment_method_public_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setRequesting(false);
      setCheckoutSubmitting(false);
    }
  }

  async function handleReserve() {
    if (!detail) {
      return;
    }
    if (!date) {
      setError("Choose a date before reserving.");
      return;
    }
    if (isSharedDesk && maxSeatQuantity <= 0 && !waitlistEnabled) {
      setError("No day-pass seats are available for this date.");
      return;
    }
    if (isSharedDesk && Math.max(1, Number(seatQuantity || 1)) > maxSeatQuantity && !waitlistEnabled) {
      setError(
        `Only ${maxSeatQuantity} ${maxSeatQuantity === 1 ? "seat is" : "seats are"} available for this date.`,
      );
      return;
    }

    const payload = currentReservationPayload();
    if (!payload) {
      setError("Choose a start and end time before reserving.");
      return;
    }

    try {
      const stillAvailable = await ensureAvailabilityCurrent({ silentUnavailable: waitlistEnabled });
      if (!stillAvailable) {
        if (waitlistEnabled) {
          await submitWaitlist(payload);
        }
        return;
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not refresh this space's availability window.");
      return;
    }

    const token = getAccessToken() ?? undefined;
    if (!token) {
      setError("");
      setCheckoutReservation(payload);
      return;
    }
    if (!authorizationConsent && !pointsCoverTotal) {
      setError("Authorize card billing before reserving.");
      return;
    }

    setError("");
    setCheckoutReservation(payload);
  }

  async function submitMembershipRequest(plan: MembershipPlanPublic, paymentMethodPublicId: string) {
    await apiFetch(
      "/api/booking-requests",
      {
        method: "POST",
        body: JSON.stringify({
          membership_plan_public_id: plan.public_id,
          desired_start_date: membershipStartDate,
          seats_requested: 1,
          member_owner_payment_method_public_id: paymentMethodPublicId,
          payment_authorization_consent: true,
          source_waitlist_public_id: initialWaitlistPublicId || undefined,
        }),
      },
      getAccessToken() ?? undefined,
    );
    router.push("/member/requests");
  }

  async function continueMembershipAfterSummary(plan: MembershipPlanPublic) {
    if (!detail) return;
    setCheckoutSubmitting(true);
    setCheckoutMembershipPlan(null);
    setRequesting(true);
    setError("");
    try {
      const token = getAccessToken() ?? undefined;
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(detail.space.public_id)}`,
        { method: "GET" },
        token,
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || `${chargeOwnerName === "this owner" ? "This owner" : chargeOwnerName} has not configured payments.`);
      }
      if (!resolved.has_payment_method || !resolved.payment_method_public_id) {
        setPendingMembershipPlan(plan);
        setPaymentMethodOpen(true);
        return;
      }
      await submitMembershipRequest(plan, resolved.payment_method_public_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Membership request failed");
    } finally {
      setRequesting(false);
      setCheckoutSubmitting(false);
    }
  }

  async function handleMembershipClick(plan: MembershipPlanPublic) {
    if (!detail) return;
    if (!getAccessToken()) {
      router.push(
        buildLoginHref(
          buildSelfNextHref({
            planPublicId: plan.public_id,
            moveInDate: membershipStartDate,
          }),
        ),
      );
      return;
    }
    if (!membershipStartDate) {
      setError("Choose a start date before continuing.");
      return;
    }
    setError("");
    setCheckoutMembershipPlan(plan);
  }

  const requestedPriddyPoints = Math.max(0, Number(priddyPoints || 0));
  const requestedOwnerPoints = Math.max(0, Number(ownerPoints || 0));
  const priddyDiscountCents = loyaltyPreview
    ? Math.min(requestedPriddyPoints * loyaltyPreview.priddy.point_value_cents, loyaltyPreview.priddy.max_redeemable_points * loyaltyPreview.priddy.point_value_cents)
    : 0;
  const ownerDiscountCents = loyaltyPreview
    ? Math.min(requestedOwnerPoints * loyaltyPreview.owner.point_value_cents, loyaltyPreview.owner.max_redeemable_points * loyaltyPreview.owner.point_value_cents)
    : 0;
  const bookingTotalCentsForRewards =
    loyaltyPreview?.subtotal_cents ??
    (breakdown ? Math.round(breakdown.total * 100) + (detail?.space.setup_fee_amount_cents ?? 0) : 0);
  const loyaltyDiscountCents = Math.min(bookingTotalCentsForRewards, priddyDiscountCents + ownerDiscountCents);
  const pointsCoverTotal =
    loyaltyDiscountCents > 0 &&
    loyaltyDiscountCents >= bookingTotalCentsForRewards;
  const currentActionReservation = currentReservationPayload();
  const waitlistAction =
    waitlistEnabled &&
    Boolean(currentActionReservation) &&
    Boolean(availability) &&
    !selectedWindowAvailableIn(availability!);
  const reserveButtonText = waitlistAction
    ? isAuthenticated
      ? "Join waitlist"
      : "Sign in to join waitlist"
    : isAuthenticated
      ? reserveActionLabel
      : `Sign in to ${reserveActionLabel}`;

  const membershipPanel = membershipBookingMode ? (
    <div className="rounded-2xl border border-line p-5">
      <div className="text-sm font-semibold text-text">
        {isVirtualOffice ? "Virtual office membership" : "Coworking membership"}
      </div>
      {membershipPlans.length > 0 && selectedMembershipPlan ? (
        <div className="mt-4 grid gap-4">
          <label className="grid gap-1 text-xs font-medium text-text-3">
            Term
            <select
              value={selectedMembershipPlan.public_id}
              onChange={(event) => setSelectedMembershipPlanId(event.target.value)}
              className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm font-medium text-text outline-none"
            >
              {membershipPlans.map((plan) => (
                <option key={plan.public_id} value={plan.public_id}>
                  {plan.commitment_months && plan.commitment_months > 1
                    ? `${plan.commitment_months}-month`
                    : "Month-to-month"}{" "}
                  • {formatCents(plan.price_cents)}/mo
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-text-3">
            Start date
            <input
              type="date"
              value={membershipStartDate}
              min={todayIso()}
              onChange={(event) => setMembershipStartDate(event.target.value)}
              className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm font-medium text-text outline-none"
            />
          </label>
          <div className="rounded-[18px] border border-line bg-surface-2 px-4 py-3">
            <div className="flex items-center justify-between text-sm text-text-2">
              <span>Monthly price</span>
              <span className="font-semibold text-text">{formatCents(selectedMembershipPlan.price_cents)}</span>
            </div>
            {(detail?.space.setup_fee_amount_cents ?? 0) > 0 ? (
              <div className="mt-2 text-xs text-text-3">
                One-time setup fees are shown before checkout.
              </div>
            ) : null}
            {selectedMembershipPlan.included_meeting_room_hours_per_month > 0 ? (
              <div className="mt-2 text-xs text-text-3">
                Includes {selectedMembershipPlan.included_meeting_room_hours_per_month} meeting-room hours per month.
              </div>
            ) : null}
          </div>
          {error ? <div className="text-sm text-danger">{error}</div> : null}
          <button
            type="button"
            onClick={() => handleMembershipClick(selectedMembershipPlan)}
            disabled={requesting}
            className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {requesting ? "Submitting..." : isAuthenticated ? "Request membership" : "Sign in to request membership"}
          </button>
        </div>
      ) : (
        <div className="mt-3 text-sm text-text-3">Membership terms have not been published yet.</div>
      )}
    </div>
  ) : null;

  if (loading) {
    return (
      <main className="w-full min-h-screen bg-bg">
        <PublicTopbar />
        <div className="mx-auto max-w-[1320px] px-6 py-8 text-sm text-text-3">Loading listing…</div>
      </main>
    );
  }

  if (error && !detail) {
    return (
      <main className="w-full min-h-screen bg-bg">
        <PublicTopbar />
        <div className="mx-auto max-w-[1320px] px-6 py-8">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
            <ChevronLeft className="h-4 w-4" />
            Back to search
          </Link>
          <div className="mt-6 rounded-2xl border border-danger/30 bg-danger-soft px-5 py-4 text-sm text-danger">{error}</div>
        </div>
      </main>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <main className="w-full min-h-screen bg-bg">
      <PublicTopbar />
      <div className="mx-auto max-w-[1320px] px-6 py-8">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Back to search
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            <section className="rounded-2xl border border-line bg-surface p-4 shadow-pop">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="overflow-hidden rounded-2xl bg-surface-2">
                  <PublicImageWithFallback
                    src={heroImage?.image_url}
                    alt={detail.space.name}
                    className="h-full min-h-[340px] w-full object-cover"
                    fallbackClassName="flex min-h-[340px] items-center justify-center bg-[linear-gradient(135deg,var(--ps-violet-100),var(--ps-mint-100))] text-sm font-semibold uppercase tracking-[0.24em] text-text-2"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {galleryImages.length > 0 ? (
                    galleryImages.map((image) => (
                      <div key={image.public_id} className="overflow-hidden rounded-xl bg-surface-2">
                        <PublicImageWithFallback
                          src={image.image_url}
                          alt={detail.space.name}
                          className="h-full min-h-[164px] w-full object-cover"
                          fallbackClassName="flex min-h-[164px] items-center justify-center bg-surface-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-text-3"
                        />
                      </div>
                    ))
                  ) : (
                    Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`placeholder-${index}`}
                        className="flex min-h-[164px] items-center justify-center rounded-xl bg-surface-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-text-4"
                      >
                        Gallery
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="border-b border-line pb-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <h1 className="text-[28px] font-semibold tracking-[-0.02em] text-text">{detail.space.name}</h1>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm font-medium text-text-2">
                      <Users className="h-4 w-4 text-text-3" />
                      {detail.space.capacity} seats
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm font-medium text-text-2">
                      <CheckCircle2 className="h-4 w-4 text-text-3" />
                      {formatSpaceTypeLabel(detail.space.space_type)}
                    </span>
                    {detail.space.amenities.slice(0, 6).map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border border-line bg-surface-2 px-3 py-2 text-sm font-medium text-text-2"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="min-w-[220px] rounded-2xl border border-brand/30 bg-brand-soft px-5 py-4">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-brand">Pricing</div>
                  <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">{primaryPrice}</div>
                  {priceRows.length > 1 ? (
                    <div className="mt-3 space-y-2 text-sm text-text-2">
                      {priceRows.slice(1).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4">
                          <span>{row.label}</span>
                          <span className="font-medium text-text">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-8 border-b border-line pb-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3">Located At</div>
                  <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">{detail.location.name}</div>
                  <p className="mt-2 text-sm leading-6 text-text-2">{locationAddress}</p>
                  <a
                    href={buildDirectionsHref(locationAddress, detail.location.lat, detail.location.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-brand hover:underline"
                  >
                    Get directions
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>

                <PublicLocationMiniMap
                  lat={detail.location.lat}
                  lng={detail.location.lng}
                  name={detail.location.name}
                />
              </div>

              <div className="grid gap-5">
                <PublicWorkingHours
                  enabled={detail.location.public_working_hours_enabled}
                  hours={detail.location.public_working_hours}
                  legacyWeekdays={detail.location.public_hours_weekdays}
                  legacyWeekends={detail.location.public_hours_weekends}
                />

                {(detail.location.public_phone || detail.location.public_email) ? (
                  <div className="rounded-2xl border border-line bg-surface p-5">
                    <div className="text-sm font-semibold text-text">Questions About This Listing?</div>
                    <div className="mt-4 space-y-3 text-sm text-text-2">
                      {detail.location.public_phone ? (
                        <a href={`tel:${detail.location.public_phone}`} className="flex items-center gap-3 hover:text-text">
                          <Phone className="h-4 w-4 text-text-4" />
                          {detail.location.public_phone}
                        </a>
                      ) : null}
                      {detail.location.public_email ? (
                        <a href={`mailto:${detail.location.public_email}`} className="flex items-center gap-3 hover:text-text">
                          <Mail className="h-4 w-4 text-text-4" />
                          {detail.location.public_email}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {(detail.location.public_parking_notes.length > 0 || detail.location.public_transit_notes.length > 0) ? (
              <section className="grid gap-6 border-b border-line pb-8 md:grid-cols-2">
                {detail.location.public_parking_notes.length > 0 ? (
                  <div>
                    <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Parking</h2>
                    <div className="mt-4 grid gap-3">
                      {detail.location.public_parking_notes.map((item) => (
                        <div key={item} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text-2">
                          <MapPin className="mt-0.5 h-4 w-4 text-text-4" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.location.public_transit_notes.length > 0 ? (
                  <div>
                    <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Transit</h2>
                    <div className="mt-4 grid gap-3">
                      {detail.location.public_transit_notes.map((item) => (
                        <div key={item} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text-2">
                          <MapPin className="mt-0.5 h-4 w-4 text-text-4" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail.location.public_included_items.length > 0 ? (
              <section className="border-b border-line pb-8">
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Included With Your Reservation</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {detail.location.public_included_items.map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-xl border border-line bg-surface px-4 py-3 text-sm text-text-2">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-success" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.support_contacts.length > 0 ? (
              <section>
                <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">We&apos;re Here To Help</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {detail.support_contacts.map((contact) => (
                    <div key={`${contact.name}-${contact.title}`} className="flex items-center gap-4 rounded-2xl border border-line bg-surface px-5 py-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,var(--ps-mint-100),var(--surface-2))] text-sm font-semibold text-text">
                        {buildInitials(contact.name)}
                      </div>
                      <div>
                        <div className="text-base font-semibold text-text">{contact.name}</div>
                        <div className="text-sm text-text-3">{contact.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            {leaseBookingMode ? (
              <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-pop">
                {detail.cancellation_policy ? (
                  <div className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand-strong">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      Book with confidence
                    </div>
                    <p className="mt-2 leading-6 text-brand-strong">{cancellationTierText}</p>
                  </div>
                ) : null}
                <LeaseBookingWidget
                  spacePublicId={detail.space.public_id}
                  spaceType={detail.space.space_type as "private_office" | "suite"}
                  spaceCapacity={detail.space.capacity}
                  organizationName={organizationName}
                  bookingMode={leaseBookingMode}
                  approvalMode={detail.location.membership_lease_approval_mode === "auto" ? "auto" : "manual"}
                  spaceMonthlyPrice={detail.space.price_monthly ?? null}
                  setupFeeAmountCents={detail.space.setup_fee_amount_cents ?? 0}
                  buildLoginNextHref={({ planPublicId, moveInDate }) =>
                    buildSelfNextHref({ planPublicId, moveInDate })
                  }
                  initialPlanPublicId={initialPlanPublicId}
                  initialMoveInDate={initialMoveInDate}
                  initialWaitlistPublicId={initialWaitlistPublicId}
                  waitlistEnabled={waitlistEnabled}
                />
              </div>
            ) : isVirtualOffice ? (
              <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-pop">
                {membershipPanel}
              </div>
            ) : (
            <div className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-pop">
              {detail.cancellation_policy ? (
                <div className="rounded-xl border border-brand/30 bg-brand-soft px-4 py-3 text-sm text-brand-strong">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    Book with confidence
                  </div>
                  <p className="mt-2 leading-6 text-brand-strong">{cancellationTierText}</p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-line p-5">
                <div className="text-center text-3xl font-semibold text-text">{primaryPrice}</div>

                <div className="mt-5 grid gap-3">
                  <AvailabilityCalendar
                    value={date}
                    onChange={(next) => {
                      setDate(next);
                      const day = dayMap.get(next);
                      const intervals = getOpenIntervalsForDay(day, openWindow);
                      const slot = findFirstSlotOnOrAfter(
                        intervals,
                        granularity,
                        openWindow.start,
                        openWindow.start,
                      );
                      if (slot) {
                        setStartTime(slot.start);
                        setEndTime(
                          minutesToTime(timeToMinutes(slot.start) + granularity),
                        );
                      }
                    }}
                    days={availability?.days ?? []}
                    open={openWindow}
                    granularityMinutes={granularity}
                    dailyPrice={
                      availability?.show_calendar_daily_prices
                        ? availability.daily_price ?? detail.space.price_daily
                        : null
                    }
                  />

                  {isConferenceRoom && !allDay ? (
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <label className="grid gap-1 text-xs font-medium text-text-3">
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-text-3" />
                          Start
                        </span>
                        <select
                          value={startTime}
                          onChange={(event) => setStartTime(event.target.value)}
                          disabled={startSlotOptions.length === 0}
                          className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm font-medium text-text outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {startSlotOptions.length === 0 ? (
                            <option value="">No times available</option>
                          ) : null}
                          {startSlotOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {formatTimeLabel(opt)}
                            </option>
                          ))}
                        </select>
                      </label>
                      <span className="hidden self-end pb-3 text-sm text-text-3 sm:block">to</span>
                      <label className="grid gap-1 text-xs font-medium text-text-3">
                        <span className="inline-flex items-center gap-2 sm:invisible">
                          <Clock3 className="h-4 w-4 text-text-3" />
                          End
                        </span>
                        <select
                          value={endTime}
                          onChange={(event) => setEndTime(event.target.value)}
                          disabled={endSlotOptions.length === 0}
                          className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm font-medium text-text outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {endSlotOptions.length === 0 ? (
                            <option value="">—</option>
                          ) : null}
                          {endSlotOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {formatTimeLabel(opt)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  ) : null}

                  {conferenceDayRateAvailable ? (
                    <label className="flex items-center justify-between gap-4 rounded-[18px] border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">
                      <span className="inline-flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={allDay}
                          disabled={allDayDisabled}
                          onChange={(event) => setAllDay(event.target.checked)}
                          className="h-5 w-5 rounded border-line"
                        />
                        <span className="font-medium text-text">All day</span>
                      </span>
                      <span className="text-text-3">{formatUsd(dailyPrice, "/day")}</span>
                    </label>
                  ) : null}

                  {isSharedDesk ? (
                    <label className="grid gap-1 text-xs font-medium text-text-3">
                      Seats
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, maxSeatQuantity)}
                        value={seatQuantity}
                        disabled={maxSeatQuantity <= 0}
                        onChange={(event) => {
                          const parsed = Number(event.target.value || 1);
                          const next = Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
                          setSeatQuantity(String(Math.min(next, Math.max(1, maxSeatQuantity))));
                        }}
                        className="h-11 rounded-2xl border border-line bg-surface px-3 text-sm font-medium text-text outline-none disabled:cursor-not-allowed disabled:opacity-60"
                      />
                      {seatAvailabilityText ? (
                        <span className="text-xs font-normal text-text-3">{seatAvailabilityText}</span>
                      ) : null}
                    </label>
                  ) : null}

                  {bufferBefore > 0 || bufferAfter > 0 ? (
                    <div className="rounded-[18px] border border-warning/30 bg-warning-soft px-4 py-3 text-xs leading-5 text-warning">
                      This space includes {bufferBefore} min before and {bufferAfter} min after each booking for turnover.
                    </div>
                  ) : null}

                  {volumeDiscounts.length > 0 && !allDay ? (
                    <div className="text-xs text-text-2">
                      {volumeDiscounts
                        .slice()
                        .sort((a, b) => a.min_hours - b.min_hours)
                        .map(
                          (t) => `Save ${t.discount_percent}% from ${t.min_hours} hrs`,
                        )
                        .join(" · ")}
                    </div>
                  ) : null}

                  {(detail.space.setup_fee_amount_cents ?? 0) > 0 ? (
                    <div className="rounded-[18px] border border-line bg-surface-2 px-4 py-3 text-xs leading-5 text-text-2">
                      One-time setup fees apply and will be shown before checkout.
                    </div>
                  ) : null}

                  {error ? <div className="text-sm text-danger">{error}</div> : null}

                  {!isAuthenticated ? (
                    <div className="rounded-[18px] border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">
                      Browse freely now, then sign in when you&apos;re ready to reserve or start a membership.
                    </div>
                  ) : null}

                  {isAuthenticated && !waitlistAction ? (
                    <label className="flex items-start gap-3 rounded-[18px] border border-line bg-surface-2 px-4 py-3 text-sm text-text-2">
                      <input
                        type="checkbox"
                        checked={authorizationConsent}
                        onChange={(event) => setAuthorizationConsent(event.target.checked)}
                        className="mt-1"
                      />
                      <span>
                        {authorizationText}
                      </span>
                    </label>
                  ) : null}

                  {!leaseBookingMode && !waitlistAction ? (
                    <div className="rounded-[18px] border border-line bg-surface px-4 py-3">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-success-soft text-success">
                          <Gift className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-text">Rewards</div>
                          {!isAuthenticated ? (
                            <div className="mt-1 text-sm text-text-3">Sign in to view and redeem points.</div>
                          ) : loyaltyLoading ? (
                            <div className="mt-1 text-sm text-text-3">Checking your balance...</div>
                          ) : loyaltyPreview?.eligible ? (
                            <>
                              <div className="mt-1 text-sm text-text-2">
                                Apply eligible points before payment. Discounts can cover up to the full booking total.
                              </div>
                              <div className="mt-3 grid gap-3">
                                {loyaltyPreview.priddy.eligible ? (
                                  <RewardInput
                                    label="Priddy Points"
                                    balance={loyaltyPreview.priddy.balance}
                                    max={loyaltyPreview.priddy.max_redeemable_points}
                                    value={priddyPoints}
                                    onChange={setPriddyPoints}
                                  />
                                ) : loyaltyPreview.priddy.reason ? (
                                  <div className="text-xs text-text-3">{loyaltyPreview.priddy.reason}</div>
                                ) : null}
                                {loyaltyPreview.owner.eligible ? (
                                  <RewardInput
                                    label="Owner points"
                                    balance={loyaltyPreview.owner.balance}
                                    max={loyaltyPreview.owner.max_redeemable_points}
                                    value={ownerPoints}
                                    onChange={setOwnerPoints}
                                  />
                                ) : loyaltyPreview.owner.reason ? (
                                  <div className="text-xs text-text-3">{loyaltyPreview.owner.reason}</div>
                                ) : null}
                                <div className="flex h-10 items-center justify-between rounded-2xl bg-success-soft px-3 text-sm font-semibold text-success">
                                  <span>Rewards savings</span>
                                  <span>{formatCents(loyaltyDiscountCents)}</span>
                                </div>
                              </div>
                            </>
                          ) : (
                            <div className="mt-1 text-sm text-text-3">
                              {loyaltyPreview?.reason || "Rewards are not available for this booking."}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleReserve}
                    disabled={
                      requesting ||
                      !date ||
                      (waitlistAction && !currentActionReservation) ||
                      (!waitlistAction && !allDay && (!startTime || !endTime))
                    }
                    className="inline-flex h-12 items-center justify-center rounded-full bg-brand px-6 text-sm font-semibold text-white transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requesting ? (waitlistAction ? "Joining waitlist..." : "Reserving...") : reserveButtonText}
                  </button>
                </div>

                {breakdown != null ? (
                  <div className="mt-5 space-y-3 text-sm text-text-2">
                    {breakdown.basis === "daily" ? (
                      <div className="flex items-center justify-between">
                        <span>{isSharedDesk ? `Day Pass x ${bookingQuantity}` : "Day rate"}</span>
                        <span>{formatUsd(breakdown.base)}</span>
                      </div>
                    ) : breakdown.basis === "capped_to_daily" ? (
                      <>
                        <div className="flex items-center justify-between text-text-3 line-through">
                          <span>
                            {formatUsd(hourlyPrice)} x {hours} hrs
                          </span>
                          <span>{formatUsd((hourlyAmount ?? 0) * hours)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Capped at day rate</span>
                          <span>{formatUsd(breakdown.base)}</span>
                        </div>
                      </>
                    ) : breakdown.basis === "hourly" ? (
                      <div className="flex items-center justify-between">
                        <span>
                          {formatUsd(hourlyPrice)} x {hours} {hours === 1 ? "hour" : "hours"}
                        </span>
                        <span>{formatUsd(breakdown.base)}</span>
                      </div>
                    ) : breakdown.basis === "hourly_day_span" ? (
                      <div className="flex items-center justify-between">
                        <span>
                          {formatUsd(hourlyPrice)} x {breakdown.units} hours
                        </span>
                        <span>{formatUsd(breakdown.base)}</span>
                      </div>
                    ) : null}

                    {breakdown.discountPercent > 0 ? (
                      <div className="flex items-center justify-between text-success">
                        <span>Volume discount ({breakdown.discountPercent}%)</span>
                        <span>-{formatUsd(breakdown.discountAmount)}</span>
                      </div>
                    ) : null}

                    {loyaltyDiscountCents > 0 ? (
                      <div className="flex items-center justify-between text-success">
                        <span>Rewards</span>
                        <span>-{formatCents(loyaltyDiscountCents)}</span>
                      </div>
                    ) : null}

                    {(detail.space.setup_fee_amount_cents ?? 0) > 0 ? (
                      <div className="flex items-center justify-between text-text-3">
                        <span>Setup fees</span>
                        <span>shown before checkout</span>
                      </div>
                    ) : null}

                    <div className="border-t border-line" />
                    <div className="flex items-center justify-between font-semibold text-text">
                      <span>Estimated due on approval</span>
                      <span>{formatCents(Math.max(0, Math.round(breakdown.total * 100) - loyaltyDiscountCents))}</span>
                    </div>
                  </div>
                ) : (
                  priceRows.length > 1 ? (
                    <div className="mt-5 space-y-2 text-sm text-text-2">
                      {priceRows.slice(1).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4">
                          <span>{row.label}</span>
                          <span className="font-medium text-text">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>

              {isSharedDesk ? membershipPanel : null}
            </div>
            )}
          </aside>
        </div>
      </div>

      <CheckoutSummaryModal
        open={Boolean(checkoutReservation || checkoutMembershipPlan)}
        payload={
          checkoutReservation ??
          (checkoutMembershipPlan
            ? {
                membership_plan_public_id: checkoutMembershipPlan.public_id,
                desired_start_date: membershipStartDate,
              }
            : null)
        }
        rewardsDiscountCents={checkoutReservation ? loyaltyDiscountCents : 0}
        submitting={checkoutSubmitting || requesting}
        confirmLabel={checkoutMembershipPlan ? "Continue to payment" : "Continue"}
        onClose={() => {
          setCheckoutReservation(null);
          setCheckoutMembershipPlan(null);
        }}
        onConfirm={() => {
          if (checkoutReservation) {
            continueReservationAfterSummary(checkoutReservation).catch(() => null);
          } else if (checkoutMembershipPlan) {
            continueMembershipAfterSummary(checkoutMembershipPlan).catch(() => null);
          }
        }}
      />

      <PaymentMethodModal
        open={paymentMethodOpen}
        spacePublicId={detail.space.public_id}
        organizationName={organizationName}
        onClose={() => setPaymentMethodOpen(false)}
        onSaved={(paymentMethodPublicId) => {
          setPaymentMethodOpen(false);
          if (pendingMembershipPlan) {
            const plan = pendingMembershipPlan;
            setPendingMembershipPlan(null);
            submitMembershipRequest(plan, paymentMethodPublicId).catch(() => null);
          } else if (pendingReservation) {
            submitReservation(pendingReservation, paymentMethodPublicId).catch(() => null);
          }
        }}
      />
      {guestCheckoutOpen ? (
        <GuestCheckoutModal
          payload={guestPayload}
          onClose={() => setGuestCheckoutOpen(false)}
          onBookingSubmitted={async () => {
            await fetchAndStoreAvailability().catch(() => undefined);
          }}
          onSignIn={() => {
            setGuestCheckoutOpen(false);
            router.push(buildLoginHref(buildSelfNextHref()));
          }}
        />
      ) : null}
    </main>
  );
}

function RewardInput({
  label,
  balance,
  max,
  value,
  onChange,
}: {
  label: string;
  balance: number;
  max: number;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-xs text-text-3">
      <span>
        {label}: {formatPoints(balance)} available, up to {formatPoints(max)}
      </span>
      <input
        type="number"
        min={0}
        max={max}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-2xl border border-line px-3 text-sm font-medium text-text outline-none"
      />
    </label>
  );
}

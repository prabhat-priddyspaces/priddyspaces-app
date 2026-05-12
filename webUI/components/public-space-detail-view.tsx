"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { buildLoginHref } from "@/lib/auth-redirect";
import {
  formatLocationAddress,
  formatSpaceTypeLabel,
  leaseBookingModeForSpaceType,
  MarketplaceSpaceDetailResponse,
  SpaceAvailabilityResponse,
} from "@/lib/public-marketplace";
import { LeaseBookingWidget } from "@/components/lease-booking-widget";
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
import { SubscriptionModal } from "@/components/subscription-modal";
import { PublicLocationMiniMap } from "@/components/public-location-mini-map";
import { PaymentMethodModal } from "@/components/payment-method-modal";
import { GuestCheckoutModal } from "@/components/guest-checkout-modal";

const AVAILABILITY_RANGE_DAYS = 60;

interface SubscriptionPlan {
  public_id: string;
  name: string;
  billing_cycle: string;
  price: number;
  is_active: boolean;
}

interface PublicSpaceDetailViewProps {
  spaceId: string;
  backHref: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
  initialPlanPublicId?: string;
  initialMoveInDate?: string;
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
  recurrence?: {
    frequency: "weekly" | "monthly";
    interval: number;
    count: number;
  };
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
  if (space.hourly_price != null) rows.push({ label: "Hourly", value: `$${space.hourly_price}/hour` });
  if (space.price_daily != null) rows.push({ label: "Day Rate", value: `$${space.price_daily}/day` });
  if (space.price_monthly != null) rows.push({ label: "Monthly", value: `$${space.price_monthly}/month` });
  if (space.membership_price != null) rows.push({ label: "Membership", value: `$${space.membership_price}/month` });
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
}: PublicSpaceDetailViewProps) {
  const router = useRouter();
  const isAuthenticated = Boolean(getAccessToken());
  const [detail, setDetail] = useState<MarketplaceSpaceDetailResponse | null>(null);
  const [availability, setAvailability] = useState<SpaceAvailabilityResponse | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [allDay, setAllDay] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<"none" | "weekly" | "monthly">("none");
  const [recurrenceCount, setRecurrenceCount] = useState("4");
  const [autoFilled, setAutoFilled] = useState(Boolean(initialDate));
  const [requesting, setRequesting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<ReservationPayload | null>(null);
  const [authorizationConsent, setAuthorizationConsent] = useState(false);
  const [guestCheckoutOpen, setGuestCheckoutOpen] = useState(false);
  const [guestPayload, setGuestPayload] = useState<ReservationPayload | null>(null);

  useEffect(() => {
    if (!spaceId) {
      return;
    }
    setLoading(true);
    setError("");
    const fromIso = todayIso();
    const toIso = addDaysIso(fromIso, AVAILABILITY_RANGE_DAYS);
    Promise.all([
      apiFetch<MarketplaceSpaceDetailResponse>(`/api/marketplace/spaces/${spaceId}`, { method: "GET" }),
      apiFetch<SubscriptionPlan[]>(
        `/api/subscription-plans/public?space_public_id=${encodeURIComponent(spaceId)}`,
        { method: "GET" },
      ).catch(() => []),
      apiFetch<SpaceAvailabilityResponse>(
        `/api/marketplace/spaces/${encodeURIComponent(spaceId)}/availability?from=${fromIso}&to=${toIso}`,
        { method: "GET" },
      ).catch(() => null),
    ])
      .then(([detailResponse, planResponse, availabilityResponse]) => {
        setDetail(detailResponse);
        setPlans(planResponse);
        setAvailability(availabilityResponse);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load listing");
        setDetail(null);
        setPlans([]);
        setAvailability(null);
      })
      .finally(() => setLoading(false));
  }, [spaceId]);

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
    () => buildSlotOptions(selectedDayIntervals, granularity),
    [selectedDayIntervals, granularity],
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
      const slot = findFirstSlotOnOrAfter(intervals, granularity, nowTimeInZone(tz));
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
        const slot = findFirstSlotOnOrAfter(intervals, granularity, openWindow.start);
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
  const leaseBookingMode = detail
    ? leaseBookingModeForSpaceType(detail.space.space_type)
    : null;

  const hourlyPrice =
    availability?.hourly_price ?? detail?.space.hourly_price ?? null;
  const dailyPrice =
    availability?.daily_price ?? detail?.space.price_daily ?? null;

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

  useEffect(() => {
    if (allDay && allDayDisabled) {
      setAllDay(false);
    }
  }, [allDay, allDayDisabled]);

  const hours = useMemo(() => {
    if (allDay) return dayOpenSpan ?? 0;
    if (!startTime || !endTime) return 0;
    const diff = timeToMinutes(endTime) - timeToMinutes(startTime);
    return diff > 0 ? diff / 60 : 0;
  }, [allDay, dayOpenSpan, startTime, endTime]);

  const volumeDiscounts = detail?.space.volume_discounts ?? [];

  const breakdown = useMemo(() => {
    if (allDay) {
      // Full-day: flat day rate, no volume discount.
      if (dailyPrice != null) {
        return {
          base: dailyPrice,
          discountPercent: 0,
          discountAmount: 0,
          total: dailyPrice,
          basis: "daily" as const,
          units: 1,
        };
      }
      if (hourlyPrice != null && dayOpenSpan != null) {
        const base = hourlyPrice * dayOpenSpan;
        return { base, discountPercent: 0, discountAmount: 0, total: base, basis: "hourly_day_span" as const, units: dayOpenSpan };
      }
      return null;
    }
    if (hourlyPrice == null || hours <= 0) return null;
    const baseHourly = hourlyPrice * hours;
    // Auto-cap to daily.
    if (dailyPrice != null && baseHourly > dailyPrice) {
      return {
        base: dailyPrice,
        discountPercent: 0,
        discountAmount: 0,
        total: dailyPrice,
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
  }, [allDay, dailyPrice, hourlyPrice, dayOpenSpan, hours, volumeDiscounts]);

  const subtotal = breakdown?.total ?? null;
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
  const reserveActionLabel = leaseBookingMode ? "Request to Book" : "Reserve & Pay";

  function buildSelfNextHref(extra?: { planPublicId?: string | null; moveInDate?: string }) {
    const params = new URLSearchParams();
    if (date) params.set("date", date);
    if (startTime) params.set("start_time", startTime);
    if (endTime) params.set("end_time", endTime);
    if (extra?.planPublicId) params.set("plan", extra.planPublicId);
    if (extra?.moveInDate) params.set("move_in", extra.moveInDate);
    const qs = params.toString();
    return qs ? `/spaces/${spaceId}?${qs}` : `/spaces/${spaceId}`;
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
      await apiFetch(
        "/api/booking-requests",
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
          }),
        },
        token,
      );
      router.push("/member/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setRequesting(false);
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

    const effectiveStart = allDay ? openWindow.start : startTime;
    const effectiveEnd = allDay ? openWindow.end : endTime;

    if (!effectiveStart || !effectiveEnd) {
      setError("Choose a start and end time before reserving.");
      return;
    }

    const locationTimezone = detail.location.timezone || availability?.timezone || "UTC";
    const start = zonedDateTimeToUtc(date, effectiveStart, locationTimezone);
    const end = zonedDateTimeToUtc(date, effectiveEnd, locationTimezone);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError("End time must be after start time.");
      return;
    }
    const recurrenceTotal = Math.max(1, Math.min(52, Number(recurrenceCount || 1)));
    const recurrence =
      recurrenceFrequency === "none"
        ? undefined
        : {
            frequency: recurrenceFrequency,
            interval: 1,
            count: recurrenceTotal,
          };
    const reservationPayload: ReservationPayload = {
      space_public_id: detail.space.public_id,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      booking_mode: allDay ? "day_pass" : "hourly",
      full_day: allDay,
      recurrence,
    };

    const token = getAccessToken() ?? undefined;
    if (!token) {
      setGuestPayload(reservationPayload);
      setGuestCheckoutOpen(true);
      return;
    }
    if (!authorizationConsent) {
      setError("Authorize card billing before reserving.");
      return;
    }

    setRequesting(true);
    setError("");
    try {
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(detail.space.public_id)}`,
        { method: "GET" },
        token,
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || "This owner has not configured payments.");
      }
      if (!resolved.has_payment_method) {
        setPendingReservation(reservationPayload);
        setPaymentMethodOpen(true);
        return;
      }
      await submitReservation(reservationPayload, resolved.payment_method_public_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setRequesting(false);
    }
  }

  function handleMembershipClick(plan: SubscriptionPlan) {
    if (!getAccessToken()) {
      setGuestPayload(null);
      setGuestCheckoutOpen(true);
      return;
    }
    setSelectedPlan(plan);
    setSubscriptionOpen(true);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#edf5f7_100%)]">
        <PublicTopbar />
        <div className="mx-auto max-w-[1320px] px-6 py-8 text-sm text-slate-500">Loading listing…</div>
      </main>
    );
  }

  if (error && !detail) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#edf5f7_100%)]">
        <PublicTopbar />
        <div className="mx-auto max-w-[1320px] px-6 py-8">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
            <ChevronLeft className="h-4 w-4" />
            Back to search
          </Link>
          <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        </div>
      </main>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#edf5f7_100%)]">
      <PublicTopbar />
      <div className="mx-auto max-w-[1320px] px-6 py-8">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Back to search
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            <section className="rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)]">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="overflow-hidden rounded-[24px] bg-slate-100">
                  {heroImage ? (
                    <img src={heroImage.image_url} alt={detail.space.name} className="h-full min-h-[340px] w-full object-cover" />
                  ) : (
                    <div className="flex min-h-[340px] items-center justify-center bg-[linear-gradient(135deg,_#d1fae5,_#e2e8f0)] text-sm font-semibold uppercase tracking-[0.24em] text-slate-600">
                      Priddyspaces
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {galleryImages.length > 0 ? (
                    galleryImages.map((image) => (
                      <div key={image.public_id} className="overflow-hidden rounded-[20px] bg-slate-100">
                        <img src={image.image_url} alt={detail.space.name} className="h-full min-h-[164px] w-full object-cover" />
                      </div>
                    ))
                  ) : (
                    Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`placeholder-${index}`}
                        className="flex min-h-[164px] items-center justify-center rounded-[20px] bg-slate-100 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
                      >
                        Gallery
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="border-b border-slate-200 pb-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{detail.space.name}</h1>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                      <Users className="h-4 w-4 text-slate-500" />
                      {detail.space.capacity} seats
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-slate-500" />
                      {formatSpaceTypeLabel(detail.space.space_type)}
                    </span>
                    {detail.space.amenities.slice(0, 6).map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="min-w-[220px] rounded-[24px] border border-teal-200 bg-teal-50 px-5 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">Pricing</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{primaryPrice}</div>
                  {priceRows.length > 1 ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {priceRows.slice(1).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4">
                          <span>{row.label}</span>
                          <span className="font-medium text-slate-900">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-8 border-b border-slate-200 pb-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Located At</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{detail.location.name}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{locationAddress}</p>
                  <a
                    href={buildDirectionsHref(locationAddress, detail.location.lat, detail.location.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline"
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
                {(detail.location.public_hours_weekdays || detail.location.public_hours_weekends) ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="text-sm font-semibold text-slate-900">Hours</div>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      {detail.location.public_hours_weekdays ? (
                        <div className="flex items-start gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{detail.location.public_hours_weekdays}</span>
                        </div>
                      ) : null}
                      {detail.location.public_hours_weekends ? (
                        <div className="flex items-start gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{detail.location.public_hours_weekends}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {(detail.location.public_phone || detail.location.public_email) ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="text-sm font-semibold text-slate-900">Questions About This Listing?</div>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      {detail.location.public_phone ? (
                        <a href={`tel:${detail.location.public_phone}`} className="flex items-center gap-3 hover:text-slate-900">
                          <Phone className="h-4 w-4 text-slate-400" />
                          {detail.location.public_phone}
                        </a>
                      ) : null}
                      {detail.location.public_email ? (
                        <a href={`mailto:${detail.location.public_email}`} className="flex items-center gap-3 hover:text-slate-900">
                          <Mail className="h-4 w-4 text-slate-400" />
                          {detail.location.public_email}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {(detail.location.public_parking_notes.length > 0 || detail.location.public_transit_notes.length > 0) ? (
              <section className="grid gap-6 border-b border-slate-200 pb-8 md:grid-cols-2">
                {detail.location.public_parking_notes.length > 0 ? (
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Parking</h2>
                    <div className="mt-4 grid gap-3">
                      {detail.location.public_parking_notes.map((item) => (
                        <div key={item} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.location.public_transit_notes.length > 0 ? (
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Transit</h2>
                    <div className="mt-4 grid gap-3">
                      {detail.location.public_transit_notes.map((item) => (
                        <div key={item} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail.location.public_included_items.length > 0 ? (
              <section className="border-b border-slate-200 pb-8">
                <h2 className="text-2xl font-semibold text-slate-900">Included With Your Reservation</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {detail.location.public_included_items.map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.support_contacts.length > 0 ? (
              <section>
                <h2 className="text-2xl font-semibold text-slate-900">We&apos;re Here To Help</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {detail.support_contacts.map((contact) => (
                    <div key={`${contact.name}-${contact.title}`} className="flex items-center gap-4 rounded-[24px] border border-slate-200 bg-white px-5 py-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#c7f9cc,_#e2e8f0)] text-sm font-semibold text-slate-900">
                        {buildInitials(contact.name)}
                      </div>
                      <div>
                        <div className="text-base font-semibold text-slate-900">{contact.name}</div>
                        <div className="text-sm text-slate-500">{contact.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            {leaseBookingMode ? (
              <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)]">
                {detail.cancellation_policy ? (
                  <div className="rounded-[20px] border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                    <div className="flex items-center gap-2 font-semibold">
                      <ShieldCheck className="h-4 w-4" />
                      Book with confidence
                    </div>
                    <p className="mt-2 leading-6 text-teal-800">{cancellationTierText}</p>
                  </div>
                ) : null}
                <LeaseBookingWidget
                  spacePublicId={detail.space.public_id}
                  spaceType={detail.space.space_type as "private_office" | "suite"}
                  spaceCapacity={detail.space.capacity}
                  bookingMode={leaseBookingMode}
                  spaceMonthlyPrice={detail.space.price_monthly ?? null}
                  buildLoginNextHref={({ planPublicId, moveInDate }) =>
                    buildSelfNextHref({ planPublicId, moveInDate })
                  }
                  initialPlanPublicId={initialPlanPublicId}
                  initialMoveInDate={initialMoveInDate}
                />
              </div>
            ) : (
            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)]">
              {detail.cancellation_policy ? (
                <div className="rounded-[20px] border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    Book with confidence
                  </div>
                  <p className="mt-2 leading-6 text-teal-800">{cancellationTierText}</p>
                </div>
              ) : null}

              <div className="rounded-[24px] border border-slate-200 p-5">
                <div className="text-center text-3xl font-semibold text-slate-900">{primaryPrice}</div>

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
                  />

                  {!allDay ? (
                    <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                      <label className="grid gap-1 text-xs font-medium text-slate-500">
                        <span className="inline-flex items-center gap-2">
                          <Clock3 className="h-4 w-4 text-slate-500" />
                          Start
                        </span>
                        <select
                          value={startTime}
                          onChange={(event) => setStartTime(event.target.value)}
                          disabled={startSlotOptions.length === 0}
                          className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none disabled:cursor-not-allowed disabled:opacity-60"
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
                      <span className="hidden self-end pb-3 text-sm text-slate-500 sm:block">to</span>
                      <label className="grid gap-1 text-xs font-medium text-slate-500">
                        <span className="inline-flex items-center gap-2 sm:invisible">
                          <Clock3 className="h-4 w-4 text-slate-500" />
                          End
                        </span>
                        <select
                          value={endTime}
                          onChange={(event) => setEndTime(event.target.value)}
                          disabled={endSlotOptions.length === 0}
                          className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAllDay(false)}
                      disabled={hourlyPrice == null}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        !allDay
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      By the hour
                    </button>
                    <button
                      type="button"
                      onClick={() => setAllDay(true)}
                      disabled={allDayDisabled || dailyPrice == null}
                      className={`rounded-2xl border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        allDay
                          ? "border-slate-900 bg-slate-900 text-white"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                      }`}
                    >
                      Full day
                    </button>
                  </div>

                  <div className="grid gap-2 rounded-[18px] border border-slate-200 bg-slate-50 p-3">
                    <label className="grid gap-1 text-xs font-medium text-slate-500">
                      Recurrence
                      <select
                        value={recurrenceFrequency}
                        onChange={(event) => setRecurrenceFrequency(event.target.value as "none" | "weekly" | "monthly")}
                        className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                      >
                        <option value="none">One time</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                      </select>
                    </label>
                    {recurrenceFrequency !== "none" ? (
                      <label className="grid gap-1 text-xs font-medium text-slate-500">
                        Occurrences
                        <input
                          type="number"
                          min={1}
                          max={52}
                          value={recurrenceCount}
                          onChange={(event) => setRecurrenceCount(event.target.value)}
                          className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-900 outline-none"
                        />
                      </label>
                    ) : null}
                  </div>

                  {bufferBefore > 0 || bufferAfter > 0 ? (
                    <div className="rounded-[18px] border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                      This space includes {bufferBefore} min before and {bufferAfter} min after each booking for turnover.
                    </div>
                  ) : null}

                  {volumeDiscounts.length > 0 && !allDay ? (
                    <div className="text-xs text-slate-600">
                      {volumeDiscounts
                        .slice()
                        .sort((a, b) => a.min_hours - b.min_hours)
                        .map(
                          (t) => `Save ${t.discount_percent}% from ${t.min_hours} hrs`,
                        )
                        .join(" · ")}
                    </div>
                  ) : null}

                  {error ? <div className="text-sm text-red-600">{error}</div> : null}

                  {!isAuthenticated ? (
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Browse freely now, then sign in when you&apos;re ready to reserve or start a membership.
                    </div>
                  ) : null}

                  {isAuthenticated ? (
                    <label className="flex items-start gap-3 rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        checked={authorizationConsent}
                        onChange={(event) => setAuthorizationConsent(event.target.checked)}
                        className="mt-1"
                      />
                      <span>I authorize this owner to charge my card now for instant bookings or upon approval for request-to-book spaces.</span>
                    </label>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleReserve}
                    disabled={requesting || !date || (!allDay && (!startTime || !endTime))}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requesting ? "Reserving..." : isAuthenticated ? reserveActionLabel : `Sign in to ${reserveActionLabel}`}
                  </button>
                </div>

                {breakdown != null ? (
                  <div className="mt-5 space-y-3 text-sm text-slate-700">
                    {breakdown.basis === "daily" ? (
                      <div className="flex items-center justify-between">
                        <span>Day rate</span>
                        <span>${breakdown.base.toLocaleString()}</span>
                      </div>
                    ) : breakdown.basis === "capped_to_daily" ? (
                      <>
                        <div className="flex items-center justify-between text-slate-500 line-through">
                          <span>
                            ${hourlyPrice} x {hours} hrs
                          </span>
                          <span>${(hourlyPrice! * hours).toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span>Capped at day rate</span>
                          <span>${breakdown.base.toLocaleString()}</span>
                        </div>
                      </>
                    ) : breakdown.basis === "hourly" ? (
                      <div className="flex items-center justify-between">
                        <span>
                          ${hourlyPrice} x {hours} {hours === 1 ? "hour" : "hours"}
                        </span>
                        <span>${breakdown.base.toLocaleString()}</span>
                      </div>
                    ) : breakdown.basis === "hourly_day_span" ? (
                      <div className="flex items-center justify-between">
                        <span>
                          ${hourlyPrice} x {breakdown.units} hours
                        </span>
                        <span>${breakdown.base.toLocaleString()}</span>
                      </div>
                    ) : null}

                    {breakdown.discountPercent > 0 ? (
                      <div className="flex items-center justify-between text-emerald-700">
                        <span>Volume discount ({breakdown.discountPercent}%)</span>
                        <span>−${breakdown.discountAmount.toLocaleString()}</span>
                      </div>
                    ) : null}

                    <div className="border-t border-slate-200" />
                    <div className="flex items-center justify-between font-semibold text-slate-900">
                      <span>Total before taxes</span>
                      <span>${breakdown.total.toLocaleString()}</span>
                    </div>
                  </div>
                ) : (
                  priceRows.length > 1 ? (
                    <div className="mt-5 space-y-2 text-sm text-slate-600">
                      {priceRows.slice(1).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4">
                          <span>{row.label}</span>
                          <span className="font-medium text-slate-900">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null
                )}
              </div>

              {plans.length > 0 ? (
                <div className="rounded-[24px] border border-slate-200 p-5">
                  <div className="text-sm font-semibold text-slate-900">Membership plans</div>
                  <div className="mt-4 grid gap-3">
                    {plans.map((plan) => (
                      <div key={plan.public_id} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">{plan.name}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {plan.billing_cycle} • ${plan.price}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleMembershipClick(plan)}
                          className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                        >
                          {isAuthenticated ? "Start membership" : "Sign in for membership"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            )}
          </aside>
        </div>
      </div>

      {selectedPlan ? (
        <SubscriptionModal
          open={subscriptionOpen}
          spacePublicId={spaceId}
          planPublicId={selectedPlan.public_id}
          planName={selectedPlan.name}
          onClose={() => setSubscriptionOpen(false)}
          onDone={() => {
            setSubscriptionOpen(false);
            router.push("/member/subscriptions");
          }}
        />
      ) : null}
      <PaymentMethodModal
        open={paymentMethodOpen}
        spacePublicId={detail.space.public_id}
        onClose={() => setPaymentMethodOpen(false)}
        onSaved={(paymentMethodPublicId) => {
          setPaymentMethodOpen(false);
          if (pendingReservation) {
            submitReservation(pendingReservation, paymentMethodPublicId).catch(() => null);
          }
        }}
      />
      {guestCheckoutOpen ? (
        <GuestCheckoutModal
          payload={guestPayload}
          onClose={() => setGuestCheckoutOpen(false)}
          onSignIn={() => {
            setGuestCheckoutOpen(false);
            router.push(buildLoginHref(buildSelfNextHref()));
          }}
        />
      ) : null}
    </main>
  );
}

import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { BookingPaymentMethodSetup } from "../../components/BookingPaymentMethodSetup";
import {
  DEFAULT_GRANULARITY_MINUTES,
  buildEndSlotOptions,
  buildSlotOptions,
  getDayOpenWindow,
  getOpenIntervalsForDay,
  isDayBookable,
  timeToMinutes,
  type SpaceAvailabilityResponse,
} from "../../lib/spaceAvailability";

type Space = {
  public_id: string;
  organization_name?: string | null;
  booking_approval_mode?: string | null;
  membership_lease_approval_mode?: string | null;
  payment_failure_hold_minutes?: number | null;
  space_type: string;
  capacity: number;
  price_hourly?: number | null;
  price_daily?: number | null;
  price_monthly?: number | null;
  availability_status: string;
  availability_start_time?: string | null;
  availability_end_time?: string | null;
  buffer_before_minutes?: number | null;
  buffer_after_minutes?: number | null;
  amenities?: string | null;
};

type SpaceImage = {
  public_id: string;
  image_url: string;
  is_primary: boolean;
};

type MembershipPlan = {
  public_id: string;
  booking_mode: string;
  name: string;
  billing_cycle: string;
  price_cents: number;
  commitment_months: number | null;
  included_meeting_room_hours_per_month: number;
};

type PaymentMethodResolve = {
  is_configured: boolean;
  has_payment_method: boolean;
  payment_method_public_id: string | null;
  message: string | null;
};

type BookingRequestResult = {
  public_id: string;
  status: string;
  payment_status?: string | null;
  booking_public_id?: string | null;
  payment_hold_expires_at?: string | null;
};

type ReservationPayload = {
  space_public_id: string;
  start_datetime: string;
  end_datetime: string;
  booking_mode: "hourly" | "day_pass";
  full_day: boolean;
  seats_requested?: number;
};

type CheckoutPreview = {
  base_amount_cents: number;
  setup_fee_amount_cents: number;
  discount_amount_cents: number;
  tax_amount_cents: number;
  total_amount_cents: number;
  line_items: Array<{ label: string; amount_cents: number }>;
};

function toDateIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextDateOptions() {
  return Array.from({ length: 14 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return toDateIso(date);
  });
}

function formatCents(cents: number) {
  return `$${(cents / 100).toLocaleString(undefined, { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export function SpaceDetailScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const { spaceId } = route.params || {};
  const [space, setSpace] = useState<Space | null>(null);
  const [availability, setAvailability] = useState<SpaceAvailabilityResponse | null>(null);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [bookingDate, setBookingDate] = useState(toDateIso(new Date()));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [fullDay, setFullDay] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
  const [paymentSetupOpen, setPaymentSetupOpen] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<ReservationPayload | null>(null);
  const [pendingMembershipPlan, setPendingMembershipPlan] = useState<MembershipPlan | null>(null);
  const [checkoutReservation, setCheckoutReservation] = useState<ReservationPayload | null>(null);
  const [checkoutMembershipPlan, setCheckoutMembershipPlan] = useState<MembershipPlan | null>(null);
  const [checkoutPreview, setCheckoutPreview] = useState<CheckoutPreview | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [seatQuantity, setSeatQuantity] = useState("1");

  useEffect(() => {
    if (!token || !spaceId) return;
    setLoading(true);
    const fromDate = toDateIso(new Date());
    const toDate = new Date();
    toDate.setDate(toDate.getDate() + 14);
    Promise.all([
      apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }, token),
      apiFetch<SpaceImage[]>(`/api/spaces/${spaceId}/media`, { method: "GET" }, token).catch(() => []),
      apiFetch<MembershipPlan[]>(
        `/api/membership-plans/public?space_public_id=${encodeURIComponent(spaceId)}`,
        { method: "GET" },
        token
      ).catch(() => []),
      apiFetch<SpaceAvailabilityResponse>(
        `/api/marketplace/spaces/${encodeURIComponent(spaceId)}/availability?from=${fromDate}&to=${toDateIso(toDate)}`,
        { method: "GET" },
        token
      ).catch(() => null)
    ])
      .then(([spaceResp, imageResp, planResp, availabilityResp]) => {
        setSpace(spaceResp);
        setImages(imageResp);
        setPlans(planResp);
        setAvailability(availabilityResp);
        const open = getDayOpenWindow({
          availability_start_time: availabilityResp?.availability_start_time ?? spaceResp.availability_start_time ?? null,
          availability_end_time: availabilityResp?.availability_end_time ?? spaceResp.availability_end_time ?? null
        });
        const granularity = availabilityResp?.granularity_minutes ?? DEFAULT_GRANULARITY_MINUTES;
        const firstBookableDay = availabilityResp?.days.find((day) => isDayBookable(day, open, granularity));
        const selectedDate = availabilityResp && firstBookableDay ? firstBookableDay.date : fromDate;
        setBookingDate(selectedDate);
        const today = availabilityResp?.days.find((day) => day.date === selectedDate);
        const intervals = availabilityResp ? getOpenIntervalsForDay(today, open) : [open];
        const options = buildSlotOptions(intervals, granularity, open.start);
        if (options.length > 0) {
          setStartTime(options[0]);
          const endOptions = buildEndSlotOptions(intervals, options[0], granularity);
          setEndTime(endOptions[0] || options[0]);
        }
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load space"))
      .finally(() => setLoading(false));
  }, [token, spaceId]);

  const hero = images.find((img) => img.is_primary) || images[0];
  const dateOptions = nextDateOptions();
  const actionLabel = space?.booking_approval_mode === "auto" ? "Reserve & Pay" : "Request to book";
  const membershipActionLabel = space?.membership_lease_approval_mode === "auto" ? "Reserve & Pay" : "Request membership";
  const isConferenceRoom = space?.space_type === "conference_room";
  const isSharedDesk = space?.space_type === "shared_desk";
  const isMembershipOnly = ["private_office", "suite", "virtual_office"].includes(space?.space_type || "");
  const membershipPlans = useMemo(() => {
    const expectedMode =
      space?.space_type === "shared_desk"
        ? "monthly_membership"
        : space?.space_type === "virtual_office"
          ? "virtual_membership"
          : space?.space_type === "suite"
            ? "suite_lease"
            : space?.space_type === "private_office"
              ? "private_office_lease"
              : null;
    return expectedMode ? plans.filter((plan) => plan.booking_mode === expectedMode) : [];
  }, [plans, space?.space_type]);
  const openWindow = useMemo(
    () =>
      getDayOpenWindow({
        availability_start_time: availability?.availability_start_time ?? space?.availability_start_time ?? null,
        availability_end_time: availability?.availability_end_time ?? space?.availability_end_time ?? null
      }),
    [availability, space]
  );
  const granularity = availability?.granularity_minutes ?? DEFAULT_GRANULARITY_MINUTES;
  const dayMap = useMemo(() => {
    const map = new Map<string, SpaceAvailabilityResponse["days"][number]>();
    for (const day of availability?.days ?? []) map.set(day.date, day);
    return map;
  }, [availability]);
  const selectedDay = dayMap.get(bookingDate);
  const selectedIntervals = useMemo(
    () => (availability ? getOpenIntervalsForDay(selectedDay, openWindow) : [openWindow]),
    [availability, openWindow, selectedDay],
  );
  const startOptions = useMemo(
    () => buildSlotOptions(selectedIntervals, granularity, openWindow.start),
    [granularity, openWindow.start, selectedIntervals],
  );
  const endOptions = useMemo(
    () => buildEndSlotOptions(selectedIntervals, startTime, granularity),
    [granularity, selectedIntervals, startTime],
  );
  const selectedDayHasConflict = Boolean(
    availability &&
      selectedDay &&
      (selectedDay.fully_blocked ||
        (selectedDay.busy_intervals ?? []).some((busy) => {
          const busyStart = Math.max(timeToMinutes(busy.start), timeToMinutes(openWindow.start));
          const busyEnd = Math.min(timeToMinutes(busy.end), timeToMinutes(openWindow.end));
          return busyEnd > busyStart;
        }))
  );
  const fullDayDisabled = !space?.price_daily || selectedDayHasConflict || (availability ? !selectedDay : false);
  const checkoutPayload = useMemo(
    () =>
      checkoutReservation
        ? checkoutReservation
        : checkoutMembershipPlan
          ? {
              membership_plan_public_id: checkoutMembershipPlan.public_id,
              desired_start_date: bookingDate
            }
          : null,
    [bookingDate, checkoutMembershipPlan, checkoutReservation],
  );

  useEffect(() => {
    if (!token || !checkoutPayload) {
      setCheckoutPreview(null);
      return;
    }
    let active = true;
    setCheckoutLoading(true);
    apiFetch<CheckoutPreview>(
      "/api/booking-requests/preview",
      { method: "POST", body: JSON.stringify(checkoutPayload) },
      token
    )
      .then((preview) => {
        if (active) setCheckoutPreview(preview);
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Unable to load checkout summary");
      })
      .finally(() => {
        if (active) setCheckoutLoading(false);
      });
    return () => {
      active = false;
    };
  }, [checkoutPayload, token]);

  useEffect(() => {
    if (isSharedDesk) setFullDay(true);
    if (isConferenceRoom) setFullDay(false);
  }, [isConferenceRoom, isSharedDesk]);

  useEffect(() => {
    if (fullDay) {
      if (fullDayDisabled) setFullDay(false);
      return;
    }
    if (startOptions.length === 0) {
      if (startTime || endTime) {
        setStartTime("");
        setEndTime("");
      }
      return;
    }
    if (!startOptions.includes(startTime)) {
      const nextStart = startOptions[0];
      setStartTime(nextStart);
      const nextEndOptions = buildEndSlotOptions(selectedIntervals, nextStart, granularity);
      setEndTime(nextEndOptions[0] || "");
      return;
    }
    if (endOptions.length > 0 && !endOptions.includes(endTime)) {
      setEndTime(endOptions[0]);
    }
  }, [endOptions, endTime, fullDay, fullDayDisabled, granularity, selectedIntervals, startOptions, startTime]);

  function dateIsUnavailable(option: string) {
    if (!availability) return false;
    return !isDayBookable(dayMap.get(option), openWindow, granularity);
  }

  function chooseDate(option: string) {
    setBookingDate(option);
    const day = dayMap.get(option);
    const intervals = availability ? getOpenIntervalsForDay(day, openWindow) : [openWindow];
    const starts = buildSlotOptions(intervals, granularity, openWindow.start);
    const nextStart = starts[0] ?? "";
    setStartTime(nextStart);
    setEndTime(nextStart ? buildEndSlotOptions(intervals, nextStart, granularity)[0] ?? "" : "");
  }

  async function submitBooking(payload: ReservationPayload, paymentMethodPublicId: string | null) {
    if (!token) return;
    const result = await apiFetch<BookingRequestResult>(
      "/api/booking-requests",
      {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          member_owner_payment_method_public_id: paymentMethodPublicId,
          payment_authorization_consent: true
        })
      },
      token
    );
    if (result.status === "approved" && result.payment_status === "succeeded") {
      setMessage("Payment successful. Your booking is confirmed.");
    } else if (result.status === "payment_failed") {
      const deadline = result.payment_hold_expires_at ? new Date(result.payment_hold_expires_at).toLocaleTimeString() : "the recovery window";
      setMessage(`Payment failed. This booking is on hold until ${deadline}. Update your card from booking details.`);
    } else if (result.status === "cancelled") {
      setMessage("Payment failed and the booking was cancelled. Start a new request.");
    } else {
      setMessage("Request submitted for owner review.");
    }
  }

  async function continueBookingAfterSummary(payload: ReservationPayload) {
    if (!token || !space) return;
    setSubmitting(true);
    setCheckoutReservation(null);
    setMessage("");
    try {
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(space.public_id)}`,
        { method: "GET" },
        token
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || "This owner has not configured payments.");
      }
      if (!resolved.has_payment_method || !resolved.payment_method_public_id) {
        setPendingReservation(payload);
        setPaymentSetupOpen(true);
        setMessage("Add a booking card to continue.");
        return;
      }
      await submitBooking(payload, resolved.payment_method_public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to send booking request");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequest() {
    if (!token || !space) return;
    if (!isConferenceRoom && !isSharedDesk) return;
    const dayPass = isSharedDesk || (isConferenceRoom && fullDay);
    const effectiveStart = dayPass ? openWindow.start : startTime;
    const effectiveEnd = dayPass ? openWindow.end : endTime;
    if (availability && dateIsUnavailable(bookingDate)) {
      setMessage("Choose an available date.");
      return;
    }
    if (dayPass && fullDayDisabled) {
      setMessage(isConferenceRoom ? "All day is not available for this date." : "Day pass is not available for this date.");
      return;
    }
    if (isConferenceRoom && !dayPass && (!startOptions.includes(startTime) || !endOptions.includes(endTime))) {
      setMessage("Choose an available time.");
      return;
    }
    const start = new Date(`${bookingDate}T${effectiveStart}:00`);
    const end = new Date(`${bookingDate}T${effectiveEnd}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setMessage("Choose a valid booking window");
      return;
    }
    setMessage("");
    setCheckoutReservation({
      space_public_id: space.public_id,
      start_datetime: start.toISOString(),
      end_datetime: end.toISOString(),
      booking_mode: dayPass ? "day_pass" : "hourly",
      full_day: dayPass,
      seats_requested: isSharedDesk ? Math.max(1, Number(seatQuantity || 1)) : 1
    });
  }

  async function submitMembership(plan: MembershipPlan, paymentMethodPublicId: string) {
    if (!token) return;
    await apiFetch<BookingRequestResult>(
      "/api/booking-requests",
      {
        method: "POST",
        body: JSON.stringify({
          membership_plan_public_id: plan.public_id,
          desired_start_date: bookingDate,
          seats_requested: 1,
          member_owner_payment_method_public_id: paymentMethodPublicId,
          payment_authorization_consent: true
        })
      },
      token
    );
    setMessage("Membership request submitted for owner review.");
  }

  async function continueMembershipAfterSummary(plan: MembershipPlan) {
    if (!token || !space) return;
    setSubscribing(true);
    setCheckoutMembershipPlan(null);
    setMessage("");
    try {
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(space.public_id)}`,
        { method: "GET" },
        token
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || "This owner has not configured payments.");
      }
      if (!resolved.has_payment_method || !resolved.payment_method_public_id) {
        setPendingMembershipPlan(plan);
        setPaymentSetupOpen(true);
        setMessage("Add a booking card to continue.");
        return;
      }
      await submitMembership(plan, resolved.payment_method_public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Membership request failed");
    } finally {
      setSubscribing(false);
    }
  }

  async function handleSubscribe(plan: MembershipPlan) {
    if (!token || !space) return;
    setMessage("");
    setCheckoutMembershipPlan(plan);
  }

  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {hero ? <Image source={{ uri: hero.image_url }} style={styles.hero} /> : null}
      {space ? (
        <>
          <Text style={styles.title}>{space.space_type}</Text>
          {space.space_type !== "virtual_office" ? (
            <Text style={styles.subtitle}>
              {isSharedDesk ? "Desks available" : "Capacity"} {space.capacity}
            </Text>
          ) : null}
          <Text style={styles.subtitle}>Status: {space.availability_status}</Text>
          {(isConferenceRoom || isSharedDesk) && (space.availability_start_time || space.availability_end_time) ? (
            <Text style={styles.subtitle}>
              Hours: {space.availability_start_time || "--:--"} to {space.availability_end_time || "--:--"}
            </Text>
          ) : null}
          {space.amenities ? <Text style={styles.subtitle}>Amenities: {space.amenities}</Text> : null}
          {isConferenceRoom && (space.buffer_before_minutes || space.buffer_after_minutes) ? (
            <Text style={styles.subtitle}>
              Buffer: {space.buffer_before_minutes || 0} min before, {space.buffer_after_minutes || 0} min after
            </Text>
          ) : null}
          <Text style={styles.sectionLabel}>{isMembershipOnly ? "Start date" : "Date"}</Text>
          <View style={styles.chipRow}>
            {dateOptions.slice(0, 7).map((option) => {
              const unavailable = dateIsUnavailable(option);
              return (
                <TouchableOpacity
                  key={option}
                  style={[
                    styles.chip,
                    bookingDate === option ? styles.chipActive : null,
                    unavailable ? styles.chipDisabled : null
                  ]}
                  disabled={unavailable}
                  onPress={() => chooseDate(option)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      bookingDate === option ? styles.chipTextActive : null,
                      unavailable ? styles.chipTextDisabled : null
                    ]}
                  >
                    {option.slice(5)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {isSharedDesk ? (
            <>
              <Text style={styles.sectionLabel}>Seats</Text>
              <TextInput
                style={styles.input}
                value={seatQuantity}
                onChangeText={setSeatQuantity}
                keyboardType="number-pad"
                placeholder="1"
              />
            </>
          ) : null}
          {isConferenceRoom ? (
            <>
              <Text style={styles.sectionLabel}>Booking type</Text>
              <View style={styles.modeRow}>
                <TouchableOpacity
                  style={[styles.modeButton, !fullDay ? styles.modeButtonActive : null]}
                  onPress={() => setFullDay(false)}
                >
                  <Text style={[styles.modeText, !fullDay ? styles.modeTextActive : null]}>Hourly</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modeButton,
                    fullDay ? styles.modeButtonActive : null,
                    fullDayDisabled ? styles.chipDisabled : null
                  ]}
                  disabled={fullDayDisabled}
                  onPress={() => setFullDay(true)}
                >
                  <Text style={[styles.modeText, fullDay ? styles.modeTextActive : null]}>All day</Text>
                </TouchableOpacity>
              </View>
              {fullDay ? (
                <Text style={styles.subtitle}>
                  All day from {openWindow.start} to {openWindow.end}
                </Text>
              ) : (
                <>
                  <Text style={styles.sectionLabel}>Start</Text>
                  <View style={styles.chipRow}>
                    {startOptions
                      .slice(0, 10)
                      .map((option) => (
                    <TouchableOpacity
                      key={`start-${option}`}
                      style={[styles.chip, startTime === option ? styles.chipActive : null]}
                      onPress={() => {
                        setStartTime(option);
                        const next = buildEndSlotOptions(selectedIntervals, option, granularity)[0];
                        if (next) setEndTime(next);
                      }}
                    >
                      <Text style={[styles.chipText, startTime === option ? styles.chipTextActive : null]}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                  </View>
                  <Text style={styles.sectionLabel}>End</Text>
                  <View style={styles.chipRow}>
                    {endOptions
                      .slice(0, 10)
                      .map((option) => (
                    <TouchableOpacity
                      key={`end-${option}`}
                      style={[styles.chip, endTime === option ? styles.chipActive : null]}
                      onPress={() => setEndTime(option)}
                    >
                      <Text style={[styles.chipText, endTime === option ? styles.chipTextActive : null]}>{option}</Text>
                    </TouchableOpacity>
                  ))}
                  </View>
                </>
              )}
            </>
          ) : null}
          {isConferenceRoom || isSharedDesk ? (
            <TouchableOpacity style={styles.primaryButton} onPress={handleRequest} disabled={submitting}>
              <Text style={styles.primaryButtonText}>
                {submitting ? "Sending booking request..." : actionLabel}
              </Text>
            </TouchableOpacity>
          ) : null}
          {paymentSetupOpen && token ? (
            <BookingPaymentMethodSetup
              token={token}
              spacePublicId={(pendingReservation?.space_public_id || space.public_id)}
              organizationName={space.organization_name}
              onSaved={(paymentMethodPublicId) => {
                setPaymentSetupOpen(false);
                if (pendingMembershipPlan) {
                  const plan = pendingMembershipPlan;
                  setPendingMembershipPlan(null);
                  setSubscribing(true);
                  submitMembership(plan, paymentMethodPublicId)
                    .catch((err) => setMessage(err instanceof Error ? err.message : "Membership request failed"))
                    .finally(() => setSubscribing(false));
                } else if (pendingReservation) {
                  const reservation = pendingReservation;
                  setPendingReservation(null);
                  setSubmitting(true);
                  submitBooking(reservation, paymentMethodPublicId)
                    .catch((err) => setMessage(err instanceof Error ? err.message : "Unable to send booking request"))
                    .finally(() => setSubmitting(false));
                }
              }}
            />
          ) : null}
          {membershipPlans.length > 0 ? (
            <View style={styles.planSection}>
              <Text style={styles.planTitle}>
                {space.space_type === "virtual_office"
                  ? "Virtual office membership"
                  : space.space_type === "private_office" || space.space_type === "suite"
                    ? "Lease terms"
                    : "Coworking membership"}
              </Text>
              {membershipPlans.map((plan) => (
                <View key={plan.public_id} style={styles.planCard}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planMeta}>
                    {plan.commitment_months && plan.commitment_months > 1 ? `${plan.commitment_months}-month` : "Month-to-month"} • ${(plan.price_cents / 100).toLocaleString()}/mo
                  </Text>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleSubscribe(plan)}
                    disabled={subscribing}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {subscribing ? "Sending membership request..." : membershipActionLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          <Modal visible={Boolean(checkoutReservation || checkoutMembershipPlan)} transparent animationType="fade">
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Checkout summary</Text>
                <Text style={styles.modalSubtitle}>Review the full amount before checkout.</Text>
                {checkoutLoading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
                {checkoutPreview ? (
                  <View style={styles.summaryRows}>
                    {checkoutPreview.line_items.map((item, index) => (
                      <View key={`${item.label}-${index}`} style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>{item.label}</Text>
                        <Text style={styles.summaryValue}>{formatCents(item.amount_cents)}</Text>
                      </View>
                    ))}
                    {checkoutPreview.discount_amount_cents < 0 ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryDiscount}>Discount</Text>
                        <Text style={styles.summaryDiscount}>-{formatCents(Math.abs(checkoutPreview.discount_amount_cents))}</Text>
                      </View>
                    ) : null}
                    {checkoutPreview.tax_amount_cents > 0 ? (
                      <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Tax</Text>
                        <Text style={styles.summaryValue}>{formatCents(checkoutPreview.tax_amount_cents)}</Text>
                      </View>
                    ) : null}
                    <View style={[styles.summaryRow, styles.summaryTotal]}>
                      <Text style={styles.summaryTotalText}>Total due</Text>
                      <Text style={styles.summaryTotalText}>{formatCents(checkoutPreview.total_amount_cents)}</Text>
                    </View>
                  </View>
                ) : null}
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalSecondary}
                    onPress={() => {
                      setCheckoutReservation(null);
                      setCheckoutMembershipPlan(null);
                    }}
                  >
                    <Text style={styles.modalSecondaryText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalPrimary, !checkoutPreview || checkoutLoading ? styles.chipDisabled : null]}
                    disabled={!checkoutPreview || checkoutLoading}
                    onPress={() => {
                      if (checkoutReservation) {
                        continueBookingAfterSummary(checkoutReservation);
                      } else if (checkoutMembershipPlan) {
                        continueMembershipAfterSummary(checkoutMembershipPlan);
                      }
                    }}
                  >
                    <Text style={styles.modalPrimaryText}>Continue</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
  },
  hero: {
    height: 200,
    borderRadius: 16,
    marginBottom: 16
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280"
  },
  message: {
    marginTop: 12,
    color: "#DC2626",
    fontSize: 12
  },
  sectionLabel: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "600",
    color: "#374151"
  },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#FFFFFF",
    color: "#111827"
  },
  chipRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#111827",
    backgroundColor: "#111827"
  },
  chipDisabled: {
    opacity: 0.45,
    backgroundColor: "#F3F4F6"
  },
  chipText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 12
  },
  chipTextActive: {
    color: "#FFFFFF"
  },
  chipTextDisabled: {
    color: "#9CA3AF"
  },
  modeRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#FFFFFF"
  },
  modeButtonActive: {
    borderColor: "#111827",
    backgroundColor: "#111827"
  },
  modeText: {
    color: "#374151",
    fontWeight: "600"
  },
  modeTextActive: {
    color: "#FFFFFF"
  },
  primaryButton: {
    marginTop: 16,
    backgroundColor: "#111827",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  planSection: {
    marginTop: 16
  },
  planTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8
  },
  planCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    marginBottom: 10
  },
  planName: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  planMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280"
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 8,
    borderRadius: 10,
    alignItems: "center"
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600"
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.55)",
    justifyContent: "center",
    padding: 20
  },
  modalCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  modalSubtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#6B7280"
  },
  summaryRows: {
    marginTop: 16,
    gap: 10
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12
  },
  summaryLabel: {
    color: "#4B5563",
    flex: 1
  },
  summaryValue: {
    color: "#111827",
    fontWeight: "600"
  },
  summaryDiscount: {
    color: "#047857",
    fontWeight: "600"
  },
  summaryTotal: {
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    paddingTop: 12
  },
  summaryTotalText: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 15
  },
  modalActions: {
    marginTop: 18,
    flexDirection: "row",
    gap: 10
  },
  modalSecondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  modalSecondaryText: {
    color: "#111827",
    fontWeight: "600"
  },
  modalPrimary: {
    flex: 1,
    backgroundColor: "#111827",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center"
  },
  modalPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "600"
  }
});

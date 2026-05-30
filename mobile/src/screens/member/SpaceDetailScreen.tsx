import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import { useStripe } from "@stripe/stripe-react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { BookingPaymentMethodSetup } from "../../components/BookingPaymentMethodSetup";

type Space = {
  public_id: string;
  organization_name?: string | null;
  booking_approval_mode?: string | null;
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

type SubscriptionPlan = {
  public_id: string;
  name: string;
  billing_cycle: string;
  price: number;
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
};

function toDateIso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map((part) => Number(part));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function minutesToTime(value: number) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function nextDateOptions() {
  return Array.from({ length: 14 }).map((_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index);
    return toDateIso(date);
  });
}

function buildTimeOptions(space: Space | null) {
  const open = timeToMinutes(space?.availability_start_time || "09:00");
  const close = timeToMinutes(space?.availability_end_time || "18:00");
  const options: string[] = [];
  for (let mins = open; mins <= close; mins += 30) {
    options.push(minutesToTime(mins));
  }
  return options;
}

export function SpaceDetailScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const { spaceId } = route.params || {};
  const [space, setSpace] = useState<Space | null>(null);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
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
  const stripe = useStripe();

  useEffect(() => {
    if (!token || !spaceId) return;
    setLoading(true);
    Promise.all([
      apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }, token),
      apiFetch<SpaceImage[]>(`/api/spaces/${spaceId}/media`, { method: "GET" }, token).catch(() => []),
      apiFetch<SubscriptionPlan[]>(
        `/api/subscription-plans/public?space_public_id=${encodeURIComponent(spaceId)}`,
        { method: "GET" },
        token
      ).catch(() => [])
    ])
      .then(([spaceResp, imageResp, planResp]) => {
        setSpace(spaceResp);
        setImages(imageResp);
        setPlans(planResp);
        const options = buildTimeOptions(spaceResp);
        if (options.length > 0) {
          setStartTime(options[0]);
          setEndTime(options[1] || options[0]);
        }
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load space"))
      .finally(() => setLoading(false));
  }, [token, spaceId]);

  const hero = images.find((img) => img.is_primary) || images[0];
  const dateOptions = nextDateOptions();
  const timeOptions = buildTimeOptions(space);
  const actionLabel = space?.booking_approval_mode === "auto" ? "Reserve & Pay" : "Request to book";

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

  async function handleRequest() {
    if (!token || !space) return;
    const effectiveStart = fullDay ? (space.availability_start_time || "09:00").slice(0, 5) : startTime;
    const effectiveEnd = fullDay ? (space.availability_end_time || "18:00").slice(0, 5) : endTime;
    const start = new Date(`${bookingDate}T${effectiveStart}:00`);
    const end = new Date(`${bookingDate}T${effectiveEnd}:00`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setMessage("Choose a valid booking window");
      return;
    }
    setSubmitting(true);
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
      const payload: ReservationPayload = {
        space_public_id: space.public_id,
        start_datetime: start.toISOString(),
        end_datetime: end.toISOString(),
        booking_mode: fullDay ? "day_pass" : "hourly",
        full_day: fullDay
      };
      if (!resolved.has_payment_method || !resolved.payment_method_public_id) {
        setPendingReservation(payload);
        setPaymentSetupOpen(true);
        setMessage("Add a booking card to continue.");
        return;
      }
      await submitBooking(payload, resolved.payment_method_public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Request failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubscribe(plan: SubscriptionPlan) {
    if (!token || !space) return;
    setSubscribing(true);
    setMessage("");
    try {
      const res = await apiFetch<{ client_secret: string | null }>(
        "/api/payments/subscription",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: space.public_id,
            subscription_plan_public_id: plan.public_id
          })
        },
        token
      );
      if (!res.client_secret) {
        setMessage("Membership started");
        return;
      }
      const init = await stripe.initPaymentSheet({
        paymentIntentClientSecret: res.client_secret,
        merchantDisplayName: "Priddyspaces"
      });
      if (init.error) throw new Error(init.error.message);
      const present = await stripe.presentPaymentSheet();
      if (present.error) throw new Error(present.error.message);
      setMessage("Membership active");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setSubscribing(false);
    }
  }

  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {hero ? <Image source={{ uri: hero.image_url }} style={styles.hero} /> : null}
      {space ? (
        <>
          <Text style={styles.title}>{space.space_type}</Text>
          <Text style={styles.subtitle}>Capacity {space.capacity}</Text>
          <Text style={styles.subtitle}>Status: {space.availability_status}</Text>
          {space.availability_start_time || space.availability_end_time ? (
            <Text style={styles.subtitle}>
              Hours: {space.availability_start_time || "--:--"} to {space.availability_end_time || "--:--"}
            </Text>
          ) : null}
          {space.amenities ? <Text style={styles.subtitle}>Amenities: {space.amenities}</Text> : null}
          {space.buffer_before_minutes || space.buffer_after_minutes ? (
            <Text style={styles.subtitle}>
              Buffer: {space.buffer_before_minutes || 0} min before, {space.buffer_after_minutes || 0} min after
            </Text>
          ) : null}
          <Text style={styles.sectionLabel}>Date</Text>
          <View style={styles.chipRow}>
            {dateOptions.slice(0, 7).map((option) => (
              <TouchableOpacity
                key={option}
                style={[styles.chip, bookingDate === option ? styles.chipActive : null]}
                onPress={() => setBookingDate(option)}
              >
                <Text style={[styles.chipText, bookingDate === option ? styles.chipTextActive : null]}>{option.slice(5)}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.modeRow}>
            <TouchableOpacity
              style={[styles.modeButton, !fullDay ? styles.modeButtonActive : null]}
              onPress={() => setFullDay(false)}
            >
              <Text style={[styles.modeText, !fullDay ? styles.modeTextActive : null]}>Hourly</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeButton, fullDay ? styles.modeButtonActive : null]}
              onPress={() => setFullDay(true)}
              disabled={!space.price_daily}
            >
              <Text style={[styles.modeText, fullDay ? styles.modeTextActive : null]}>Full day</Text>
            </TouchableOpacity>
          </View>
          {!fullDay ? (
            <>
              <Text style={styles.sectionLabel}>Start</Text>
              <View style={styles.chipRow}>
                {timeOptions
                  .filter((option) => timeToMinutes(option) + 30 <= timeToMinutes(space.availability_end_time || "18:00"))
                  .slice(0, 10)
                  .map((option) => (
                  <TouchableOpacity
                    key={`start-${option}`}
                    style={[styles.chip, startTime === option ? styles.chipActive : null]}
                    onPress={() => {
                      setStartTime(option);
                      const next = timeOptions.find((time) => timeToMinutes(time) > timeToMinutes(option));
                      if (next) setEndTime(next);
                    }}
                  >
                    <Text style={[styles.chipText, startTime === option ? styles.chipTextActive : null]}>{option}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={styles.sectionLabel}>End</Text>
              <View style={styles.chipRow}>
                {timeOptions
                  .filter((option) => timeToMinutes(option) > timeToMinutes(startTime))
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
          ) : null}
          <TouchableOpacity style={styles.primaryButton} onPress={handleRequest} disabled={submitting}>
            <Text style={styles.primaryButtonText}>
              {submitting ? "Submitting..." : actionLabel}
            </Text>
          </TouchableOpacity>
          {paymentSetupOpen && pendingReservation && token ? (
            <BookingPaymentMethodSetup
              token={token}
              spacePublicId={pendingReservation.space_public_id}
              organizationName={space.organization_name}
              onSaved={(paymentMethodPublicId) => {
                setPaymentSetupOpen(false);
                setPendingReservation(null);
                setSubmitting(true);
                submitBooking(pendingReservation, paymentMethodPublicId)
                  .catch((err) => setMessage(err instanceof Error ? err.message : "Request failed"))
                  .finally(() => setSubmitting(false));
              }}
            />
          ) : null}
          {plans.length > 0 ? (
            <View style={styles.planSection}>
              <Text style={styles.planTitle}>Membership plans</Text>
              {plans.map((plan) => (
                <View key={plan.public_id} style={styles.planCard}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planMeta}>{plan.billing_cycle} • ${plan.price}</Text>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => handleSubscribe(plan)}
                    disabled={subscribing}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {subscribing ? "Processing..." : "Start membership"}
                    </Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
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
  chipText: {
    color: "#374151",
    fontWeight: "600",
    fontSize: 12
  },
  chipTextActive: {
    color: "#FFFFFF"
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
  }
});

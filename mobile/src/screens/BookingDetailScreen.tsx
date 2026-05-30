import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useStripe } from "@stripe/stripe-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { BookingPaymentMethodSetup } from "../components/BookingPaymentMethodSetup";

type BookingLike = {
  public_id: string;
  start_datetime: string;
  end_datetime: string;
  status: string;
  payment_status?: string | null;
  refund_amount_cents?: number | null;
  refunded_amount_cents?: number | null;
  estimated_amount?: number | null;
  booking_public_id?: string | null;
  space_public_id?: string | null;
  space_name?: string | null;
  organization_name?: string | null;
  instant_booking?: boolean;
  failure_reason?: string | null;
  payment_hold_expires_at?: string | null;
  payment_method_brand?: string | null;
  payment_method_last4?: string | null;
  payment_method_exp_month?: number | null;
  payment_method_exp_year?: number | null;
};

export function BookingDetailScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { bookingId } = route.params || {};
  const [booking, setBooking] = useState<BookingLike | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [paying, setPaying] = useState(false);
  const [updatingCard, setUpdatingCard] = useState(false);
  const [showCardSetup, setShowCardSetup] = useState(false);
  const stripe = useStripe();

  useEffect(() => {
    if (!token || !bookingId) return;
    setLoading(true);
    apiFetch<BookingLike>(`/api/bookings/${bookingId}`, { method: "GET" }, token)
      .then(setBooking)
      .catch(async () => {
        try {
          const req = await apiFetch<BookingLike>(
            `/api/booking-requests/${bookingId}`,
            { method: "GET" },
            token
          );
          setBooking(req);
        } catch (err) {
          setMessage(err instanceof Error ? err.message : "Failed to load booking");
        }
      })
      .finally(() => setLoading(false));
  }, [token, bookingId]);

  async function handlePay() {
    if (!token || !booking?.booking_public_id || !booking.estimated_amount) return;
    setPaying(true);
    setMessage("");
    try {
      const intent = await apiFetch<{ client_secret: string }>(
        "/api/payments/intent",
        {
          method: "POST",
          body: JSON.stringify({
            amount: booking.estimated_amount,
            currency: "usd",
            booking_public_id: booking.booking_public_id
          })
        },
        token
      );
      const init = await stripe.initPaymentSheet({
        paymentIntentClientSecret: intent.client_secret,
        merchantDisplayName: "Priddyspaces"
      });
      if (init.error) throw new Error(init.error.message);
      const present = await stripe.presentPaymentSheet();
      if (present.error) throw new Error(present.error.message);
      setMessage("Payment complete");
      navigation.navigate("PaymentSuccess");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setPaying(false);
    }
  }

  function failureReason() {
    const text = (booking?.failure_reason || "").trim();
    if (!text || ["0", "failed", "payment failed"].includes(text.toLowerCase())) {
      return "The payment processor declined the charge. Update the card or contact the card issuer for details.";
    }
    return text;
  }

  function holdExpired() {
    if (!booking?.payment_hold_expires_at) return false;
    return Date.now() > new Date(booking.payment_hold_expires_at).getTime();
  }

  function holdLabel() {
    if (!booking?.payment_hold_expires_at) return null;
    const date = new Date(booking.payment_hold_expires_at);
    if (Number.isNaN(date.getTime())) return null;
    return date.toLocaleString();
  }

  function cardLabel() {
    if (!booking?.payment_method_last4) return null;
    const brand = booking.payment_method_brand || "Card";
    const expiry =
      booking.payment_method_exp_month != null && booking.payment_method_exp_year != null
        ? ` · Expires ${String(booking.payment_method_exp_month).padStart(2, "0")}/${booking.payment_method_exp_year}`
        : "";
    return `${brand} ending in ${booking.payment_method_last4}${expiry}`;
  }

  async function handleCardSaved(paymentMethodPublicId: string) {
    if (!token || !booking) return;
    setUpdatingCard(true);
    setMessage("");
    try {
      await apiFetch(
        `/api/booking-requests/${booking.public_id}/payment-method`,
        {
          method: "POST",
          body: JSON.stringify({
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
          }),
        },
        token,
      );
      if (booking.instant_booking) {
        await apiFetch(
          `/api/booking-requests/${booking.public_id}/retry-payment`,
          { method: "POST", body: JSON.stringify({ operator_notes: null }) },
          token,
        );
        setMessage("Payment retried. Booking status updated.");
      } else {
        setMessage("Card updated. The owner can retry the charge before the hold expires.");
      }
      setShowCardSetup(false);
      const refreshed = await apiFetch<BookingLike>(
        `/api/booking-requests/${booking.public_id}`,
        { method: "GET" },
        token,
      );
      setBooking(refreshed);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update card");
    } finally {
      setUpdatingCard(false);
    }
  }

  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {booking ? (
        <>
          <Text style={styles.title}>Booking</Text>
          <Text style={styles.subtitle}>Status: {booking.status}</Text>
          {booking.payment_status ? <Text style={styles.subtitle}>Payment: {booking.payment_status}</Text> : null}
          {cardLabel() ? <Text style={styles.subtitle}>{cardLabel()}</Text> : null}
          <Text style={styles.subtitle}>Start: {booking.start_datetime}</Text>
          <Text style={styles.subtitle}>End: {booking.end_datetime}</Text>
          {booking.estimated_amount != null ? (
            <Text style={styles.subtitle}>Estimated: ${booking.estimated_amount}</Text>
          ) : null}
          {booking.refund_amount_cents != null || booking.refunded_amount_cents != null ? (
            <Text style={styles.subtitle}>
              Refund: ${((booking.refund_amount_cents ?? booking.refunded_amount_cents ?? 0) / 100).toFixed(2)}
            </Text>
          ) : null}
          {booking.status === "approved" && booking.booking_public_id ? (
            <TouchableOpacity style={styles.primaryButton} onPress={handlePay} disabled={paying}>
              <Text style={styles.primaryButtonText}>
                {paying ? "Processing..." : "Pay now"}
              </Text>
            </TouchableOpacity>
          ) : null}
          {booking.status === "payment_failed" ? (
            <View style={styles.failureBox}>
              <Text style={styles.failureTitle}>Payment failed</Text>
              <Text style={styles.failureText}>{failureReason()}</Text>
              {holdExpired() ? (
                <Text style={styles.failureText}>This hold expired. Start a new booking.</Text>
              ) : (
                <Text style={styles.failureText}>
                  {holdLabel() ? `Held until ${holdLabel()}. ` : ""}
                  {booking.instant_booking
                    ? "Update card and retry before the hold expires."
                    : "Update card before the hold expires; the owner can retry the charge."}
                </Text>
              )}
              {!holdExpired() && booking.space_public_id ? (
                <TouchableOpacity
                  style={styles.primaryButton}
                  onPress={() => setShowCardSetup((current) => !current)}
                  disabled={updatingCard}
                >
                  <Text style={styles.primaryButtonText}>
                    {updatingCard ? "Updating..." : booking.instant_booking ? "Update card and retry" : "Update card"}
                  </Text>
                </TouchableOpacity>
              ) : null}
              {showCardSetup && token && booking.space_public_id ? (
                <BookingPaymentMethodSetup
                  token={token}
                  spacePublicId={booking.space_public_id}
                  organizationName={booking.organization_name}
                  onSaved={handleCardSaved}
                />
              ) : null}
            </View>
          ) : null}
          {booking.status === "cancelled" && booking.payment_status === "failed" ? (
            <View style={styles.failureBox}>
              <Text style={styles.failureTitle}>Payment hold expired</Text>
              <Text style={styles.failureText}>Start a new booking to reserve this space.</Text>
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
  failureBox: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#FCA5A5",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    padding: 12
  },
  failureTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#991B1B"
  },
  failureText: {
    marginTop: 6,
    fontSize: 13,
    color: "#7F1D1D"
  }
});

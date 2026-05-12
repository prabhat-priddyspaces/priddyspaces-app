import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useStripe } from "@stripe/stripe-react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../lib/api";
import { useAuth } from "../context/AuthContext";

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

  return (
    <View style={styles.container}>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
      {booking ? (
        <>
          <Text style={styles.title}>Booking</Text>
          <Text style={styles.subtitle}>Status: {booking.status}</Text>
          {booking.payment_status ? <Text style={styles.subtitle}>Payment: {booking.payment_status}</Text> : null}
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
  }
});

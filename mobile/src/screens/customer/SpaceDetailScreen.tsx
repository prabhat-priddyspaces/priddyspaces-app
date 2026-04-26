import { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRoute } from "@react-navigation/native";
import { useStripe } from "@stripe/stripe-react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Space = {
  public_id: string;
  space_type: string;
  capacity: number;
  price_daily?: number | null;
  price_monthly?: number | null;
  availability_status: string;
  availability_start_time?: string | null;
  availability_end_time?: string | null;
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

export function SpaceDetailScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const { spaceId } = route.params || {};
  const [space, setSpace] = useState<Space | null>(null);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [startDatetime, setStartDatetime] = useState("");
  const [endDatetime, setEndDatetime] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [subscribing, setSubscribing] = useState(false);
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
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load space"))
      .finally(() => setLoading(false));
  }, [token, spaceId]);

  const hero = images.find((img) => img.is_primary) || images[0];

  async function handleRequest() {
    if (!token || !space) return;
    if (!startDatetime || !endDatetime) {
      setMessage("Enter start and end date/time");
      return;
    }
    setSubmitting(true);
    setMessage("");
    try {
      await apiFetch(
        "/api/booking-requests",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: space.public_id,
            start_datetime: new Date(startDatetime).toISOString(),
            end_datetime: new Date(endDatetime).toISOString()
          })
        },
        token
      );
      setMessage("Request submitted");
      setStartDatetime("");
      setEndDatetime("");
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
          <TextInput
            style={styles.input}
            placeholder="Start (YYYY-MM-DD HH:mm)"
            value={startDatetime}
            onChangeText={setStartDatetime}
          />
          <TextInput
            style={styles.input}
            placeholder="End (YYYY-MM-DD HH:mm)"
            value={endDatetime}
            onChangeText={setEndDatetime}
          />
          <TouchableOpacity style={styles.primaryButton} onPress={handleRequest} disabled={submitting}>
            <Text style={styles.primaryButtonText}>
              {submitting ? "Submitting..." : "Request booking"}
            </Text>
          </TouchableOpacity>
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
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
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

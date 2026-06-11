import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Subscription = {
  public_id: string;
  space_public_id: string | null;
  space_type: string | null;
  location_name: string | null;
  status: string;
  start_date: string;
  end_date: string | null;
};

export function MemberSubscriptionsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    apiFetch<Subscription[]>("/api/subscriptions", { method: "GET" }, token)
      .then(setSubscriptions)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load memberships"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function cancelSubscription(publicId: string) {
    if (!token) return;
    setBusyId(publicId);
    setConfirmingCancel(null);
    setMessage("");
    try {
      await apiFetch(`/api/subscriptions/${publicId}/cancel`, { method: "POST" }, token);
      setMessage("Membership update saved.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to cancel membership");
    } finally {
      setBusyId(null);
    }
  }

  const stats = [
    { label: "Active", value: subscriptions.filter((s) => s.status === "active").length },
    { label: "Past Due", value: subscriptions.filter((s) => s.status === "past_due").length },
    { label: "Canceling", value: subscriptions.filter((s) => s.status === "canceling").length },
  ];
  const hasPastDue = subscriptions.some((s) => s.status === "past_due");

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Memberships</Text>
      <Text style={styles.subtitle}>
        Manage active workspace memberships, billing status, and cancellation timing.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Membership update saved." ? styles.successMessage : styles.message}>
          {message}
        </Text>
      ) : null}

      {hasPastDue ? (
        <View style={styles.warningCard}>
          <Text style={styles.warningTitle}>Billing attention needed</Text>
          <Text style={styles.warningText}>
            One or more memberships are past due. Visit Payments to update membership billing.
          </Text>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("Payments")}
            accessibilityRole="button"
            accessibilityLabel="Open payments"
          >
            <Text style={styles.secondaryButtonText}>Open payments</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.statsRow}>
        {stats.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.statLabel}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      <View style={styles.list}>
        {subscriptions.length === 0 && !loading ? (
          <View style={styles.emptyCard}>
            <Text style={styles.mutedText}>No active workspace memberships yet.</Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => navigation.navigate("App", { screen: "Marketplace" })}
              accessibilityRole="button"
              accessibilityLabel="Browse available spaces"
            >
              <Text style={styles.secondaryButtonText}>Browse available spaces</Text>
            </TouchableOpacity>
          </View>
        ) : (
          subscriptions.map((subscription) => (
            <View key={subscription.public_id} style={styles.card}>
              <Text style={styles.cardTitle}>{subscription.location_name || "Workspace membership"}</Text>
              <Text style={styles.cardSubtitle}>
                {subscription.space_type || "Membership"} • {subscription.status}
              </Text>
              <Text style={styles.mutedText}>
                Starts {new Date(subscription.start_date).toLocaleDateString()}
                {subscription.end_date
                  ? ` • Ends ${new Date(subscription.end_date).toLocaleDateString()}`
                  : ""}
              </Text>
              <View style={styles.actionsRow}>
                {subscription.space_public_id ? (
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() =>
                      navigation.navigate("App", {
                        screen: "Marketplace",
                        params: {
                          screen: "SpaceDetail",
                          params: { spaceId: subscription.space_public_id },
                        },
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open membership space ${subscription.public_id}`}
                  >
                    <Text style={styles.secondaryButtonText}>Open membership space</Text>
                  </TouchableOpacity>
                ) : null}
                {subscription.status !== "canceled" && subscription.status !== "canceling" ? (
                  confirmingCancel === subscription.public_id ? (
                    <>
                      <TouchableOpacity
                        style={styles.dangerButton}
                        onPress={() => cancelSubscription(subscription.public_id)}
                        disabled={busyId === subscription.public_id}
                        accessibilityRole="button"
                        accessibilityLabel={`Confirm cancel ${subscription.public_id}`}
                      >
                        <Text style={styles.dangerButtonText}>
                          {busyId === subscription.public_id ? "Updating..." : "Confirm cancel"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.secondaryButton}
                        onPress={() => setConfirmingCancel(null)}
                        accessibilityRole="button"
                        accessibilityLabel={`Keep membership ${subscription.public_id}`}
                      >
                        <Text style={styles.secondaryButtonText}>Keep</Text>
                      </TouchableOpacity>
                    </>
                  ) : (
                    <TouchableOpacity
                      style={styles.secondaryButton}
                      onPress={() => setConfirmingCancel(subscription.public_id)}
                      disabled={busyId === subscription.public_id}
                      accessibilityRole="button"
                      accessibilityLabel={`Cancel membership ${subscription.public_id}`}
                    >
                      <Text style={styles.secondaryButtonText}>Cancel membership</Text>
                    </TouchableOpacity>
                  )
                ) : null}
              </View>
              {confirmingCancel === subscription.public_id ? (
                <Text style={styles.confirmText}>
                  Cancel this membership at the end of the current billing period?
                </Text>
              ) : null}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  container: {
    padding: 20,
    gap: 14
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827"
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280"
  },
  statsRow: {
    flexDirection: "row",
    gap: 10
  },
  statCard: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12
  },
  statLabel: {
    fontSize: 12,
    color: "#6B7280"
  },
  statValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  warningCard: {
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    padding: 14,
    gap: 6
  },
  warningTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400E"
  },
  warningText: {
    fontSize: 13,
    color: "#92400E"
  },
  list: {
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 6
  },
  emptyCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 16,
    gap: 10
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827"
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#374151"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  actionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 6
  },
  secondaryButton: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 12,
    fontWeight: "700"
  },
  dangerButton: {
    borderRadius: 10,
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  dangerButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "700"
  },
  confirmText: {
    fontSize: 12,
    color: "#991B1B",
    fontWeight: "700"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  },
  successMessage: {
    color: "#047857",
    fontSize: 12,
    fontWeight: "700"
  }
});

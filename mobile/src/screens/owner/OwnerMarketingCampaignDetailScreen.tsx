import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Campaign = {
  public_id: string;
  name: string;
  status: string;
  sender_lane: string;
  eligible_count: number;
  sent_count: number;
  opened_count: number;
  clicked_count: number;
};

type CampaignReview = {
  total: number;
  eligible: number;
  suppressed: number;
  no_email: number;
};

type CampaignRecipient = {
  public_id: string;
  email: string;
  status: string;
  suppression_reason: string | null;
  provider_message_id: string | null;
  created_at: string | null;
};

const SUCCESS_MESSAGES = new Set(["Campaign sent", "Campaign canceled"]);

export function OwnerMarketingCampaignDetailScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const { publicId } = route.params || {};
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!token || !publicId) return;
    const [campaignResult, reviewResult, recipientResult] = await Promise.all([
      apiFetch<Campaign>(`/api/marketing/campaigns/${publicId}`, { method: "GET" }, token),
      apiFetch<CampaignReview>(
        `/api/marketing/campaigns/${publicId}/review-breakdown`,
        { method: "GET" },
        token,
      ).catch(() => null),
      apiFetch<CampaignRecipient[]>(
        `/api/marketing/campaigns/${publicId}/recipients`,
        { method: "GET" },
        token,
      ).catch(() => []),
    ]);
    setCampaign(campaignResult);
    setReview(reviewResult);
    setRecipients(recipientResult);
  }, [token, publicId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load campaign"))
      .finally(() => setLoading(false));
  }, [load]);

  async function sendNow() {
    if (!token) return;
    try {
      await apiFetch(
        `/api/marketing/campaigns/${publicId}/send`,
        { method: "POST", body: JSON.stringify({}) },
        token,
      );
      setMessage("Campaign sent");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Send failed");
    }
  }

  async function cancel() {
    if (!token) return;
    try {
      await apiFetch(`/api/marketing/campaigns/${publicId}/cancel`, { method: "POST" }, token);
      setMessage("Campaign canceled");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  const canSend = campaign ? ["draft", "scheduled"].includes(campaign.status) : false;
  const canCancel = campaign ? !["sent", "canceled"].includes(campaign.status) : false;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={SUCCESS_MESSAGES.has(message) ? styles.successMessage : styles.message}>
          {message}
        </Text>
      ) : null}

      {campaign ? (
        <>
          <Text style={styles.title}>{campaign.name}</Text>
          <Text style={styles.subtitle}>
            {campaign.status} • {campaign.sender_lane.replace(/_/g, " ")}
          </Text>

          <View style={styles.chipRow}>
            <TouchableOpacity
              style={[styles.primaryButton, !canSend && styles.disabled]}
              onPress={sendNow}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send now"
            >
              <Text style={styles.primaryButtonText}>Send now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, !canCancel && styles.disabled]}
              onPress={cancel}
              disabled={!canCancel}
              accessibilityRole="button"
              accessibilityLabel="Cancel campaign"
            >
              <Text style={styles.secondaryButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.statsRow}>
            <Stat label="Eligible" value={campaign.eligible_count} />
            <Stat label="Sent" value={campaign.sent_count} />
            <Stat label="Opened" value={campaign.opened_count} />
            <Stat label="Clicked" value={campaign.clicked_count} />
          </View>

          {review ? (
            <View style={styles.section}>
              <Text style={styles.mutedText}>
                Review: total {review.total}, eligible {review.eligible}, suppressed{" "}
                {review.suppressed}, no email {review.no_email}
              </Text>
            </View>
          ) : null}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recipients ({recipients.length})</Text>
            {recipients.length === 0 ? (
              <Text style={styles.mutedText}>No recipients yet.</Text>
            ) : (
              recipients.map((recipient) => (
                <View key={recipient.public_id} style={styles.listRow}>
                  <Text style={styles.listTitle}>{recipient.email}</Text>
                  <Text style={styles.mutedText}>
                    {recipient.status}
                    {recipient.suppression_reason ? ` • ${recipient.suppression_reason}` : ""}
                  </Text>
                  <Text style={styles.mutedText}>
                    {recipient.provider_message_id || "—"}
                    {recipient.created_at
                      ? ` • ${new Date(recipient.created_at).toLocaleString()}`
                      : ""}
                  </Text>
                </View>
              ))
            )}
          </View>
        </>
      ) : !loading ? (
        <Text style={styles.mutedText}>Campaign not found.</Text>
      ) : null}
    </ScrollView>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.mutedText}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  container: {
    padding: 20,
    gap: 12
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    color: "#111827"
  },
  subtitle: {
    fontSize: 13,
    color: "#6B7280",
    textTransform: "capitalize"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    minWidth: 80,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 4
  },
  statValue: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 8
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  listRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 3
  },
  listTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827"
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700"
  },
  secondaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 16,
    backgroundColor: "#FFFFFF"
  },
  secondaryButtonText: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "700"
  },
  disabled: {
    opacity: 0.5
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
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

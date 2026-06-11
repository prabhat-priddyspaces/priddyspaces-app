import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Organization = { public_id: string; name: string };
type MarketingTemplate = { public_id: string; name: string };
type Segment = { public_id: string; name: string };

type Campaign = {
  public_id: string;
  name: string;
  status: string;
  sender_lane: string;
  eligible_count: number;
  sent_count: number;
  opened_count: number;
  scheduled_at: string | null;
};

type CampaignReview = {
  total: number;
  eligible: number;
  suppressed: number;
  no_email: number;
};

const SUCCESS_MESSAGES = new Set(["Campaign draft created", "Campaign sent", "Campaign scheduled"]);

export function OwnerMarketingCampaignsScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>(route.params?.orgId || "");
  const [templates, setTemplates] = useState<MarketingTemplate[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    template_public_id: "",
    segment_public_id: "",
    sender_lane: "shared",
    scheduled_at: "",
  });

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        setOrgId((current) => current || list[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  const loadAll = useCallback(async () => {
    if (!token || !orgId) return;
    const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
    const [templateList, segmentList, campaignList] = await Promise.all([
      apiFetch<MarketingTemplate[]>(`/api/marketing/templates?${qs}`, { method: "GET" }, token),
      apiFetch<Segment[]>(`/api/marketing/segments?${qs}`, { method: "GET" }, token),
      apiFetch<Campaign[]>(`/api/marketing/campaigns?${qs}`, { method: "GET" }, token),
    ]);
    setTemplates(templateList);
    setSegments(segmentList);
    setCampaigns(campaignList);
    setForm((current) => ({
      ...current,
      template_public_id: current.template_public_id || templateList[0]?.public_id || "",
      segment_public_id: current.segment_public_id,
    }));
  }, [token, orgId]);

  useEffect(() => {
    setLoading(true);
    loadAll()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load campaigns"))
      .finally(() => setLoading(false));
  }, [loadAll]);

  async function createCampaign() {
    if (!token) return;
    setMessage("");
    try {
      const campaign = await apiFetch<Campaign>(
        "/api/marketing/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            name: form.name,
            template_public_id: form.template_public_id,
            segment_public_id: form.segment_public_id || null,
            sender_lane: form.sender_lane,
            scheduled_at: form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
          }),
        },
        token,
      );
      setSelectedCampaign(campaign);
      setMessage("Campaign draft created");
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function reviewCampaign(campaign: Campaign) {
    if (!token) return;
    try {
      setSelectedCampaign(campaign);
      const result = await apiFetch<CampaignReview>(
        `/api/marketing/campaigns/${campaign.public_id}/review-breakdown`,
        { method: "GET" },
        token,
      );
      setReview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Review failed");
    }
  }

  async function sendCampaign(campaign: Campaign, scheduled = false) {
    if (!token) return;
    try {
      await apiFetch(
        `/api/marketing/campaigns/${campaign.public_id}/send`,
        {
          method: "POST",
          body: JSON.stringify({
            scheduled_at:
              scheduled && form.scheduled_at ? new Date(form.scheduled_at).toISOString() : null,
          }),
        },
        token,
      );
      setMessage(scheduled ? "Campaign scheduled" : "Campaign sent");
      setReview(null);
      await loadAll();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Send failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Campaigns</Text>
      <Text style={styles.subtitle}>Draft, review, snapshot, send, and track member emails.</Text>

      {orgs.length > 1 ? (
        <View style={styles.chipRow}>
          {orgs.map((org) => (
            <Chip
              key={org.public_id}
              label={org.name}
              active={orgId === org.public_id}
              accessibilityLabel={`Organization ${org.name}`}
              onPress={() => setOrgId(org.public_id)}
            />
          ))}
        </View>
      ) : null}

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={SUCCESS_MESSAGES.has(message) ? styles.successMessage : styles.message}>
          {message}
        </Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>New campaign</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Campaign name</Text>
          <TextInput
            accessibilityLabel="Campaign name"
            style={styles.input}
            value={form.name}
            onChangeText={(name) => setForm({ ...form, name })}
          />
        </View>
        <Text style={styles.label}>Template</Text>
        <View style={styles.chipRow}>
          {templates.map((template) => (
            <Chip
              key={template.public_id}
              label={template.name}
              active={form.template_public_id === template.public_id}
              accessibilityLabel={`Template ${template.name}`}
              onPress={() => setForm({ ...form, template_public_id: template.public_id })}
            />
          ))}
        </View>
        <Text style={styles.label}>Segment</Text>
        <View style={styles.chipRow}>
          <Chip
            label="All CRM members"
            active={!form.segment_public_id}
            accessibilityLabel="Segment all members"
            onPress={() => setForm({ ...form, segment_public_id: "" })}
          />
          {segments.map((segment) => (
            <Chip
              key={segment.public_id}
              label={segment.name}
              active={form.segment_public_id === segment.public_id}
              accessibilityLabel={`Segment ${segment.name}`}
              onPress={() => setForm({ ...form, segment_public_id: segment.public_id })}
            />
          ))}
        </View>
        <Text style={styles.label}>Sender lane</Text>
        <View style={styles.chipRow}>
          <Chip
            label="Platform shared"
            active={form.sender_lane === "shared"}
            accessibilityLabel="Sender shared"
            onPress={() => setForm({ ...form, sender_lane: "shared" })}
          />
          <Chip
            label="Verified business"
            active={form.sender_lane === "verified_sender"}
            accessibilityLabel="Sender verified"
            onPress={() => setForm({ ...form, sender_lane: "verified_sender" })}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Schedule (YYYY-MM-DDTHH:MM, optional)</Text>
          <TextInput
            accessibilityLabel="Scheduled at"
            style={styles.input}
            value={form.scheduled_at}
            onChangeText={(scheduled_at) => setForm({ ...form, scheduled_at })}
            autoCapitalize="none"
            placeholder="2026-07-01T09:00"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            (!form.name || !form.template_public_id) && styles.primaryButtonDisabled,
          ]}
          onPress={createCampaign}
          disabled={!form.name || !form.template_public_id}
          accessibilityRole="button"
          accessibilityLabel="Create draft"
        >
          <Text style={styles.primaryButtonText}>Create draft</Text>
        </TouchableOpacity>
      </View>

      {selectedCampaign && review ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Review: {selectedCampaign.name}</Text>
          <Text style={styles.mutedText}>
            Total {review.total} • Eligible {review.eligible} • Suppressed {review.suppressed} • No
            email {review.no_email}
          </Text>
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => sendCampaign(selectedCampaign)}
              accessibilityRole="button"
              accessibilityLabel="Send now"
            >
              <Text style={styles.primaryButtonText}>Send now</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, !form.scheduled_at && styles.primaryButtonDisabled]}
              onPress={() => sendCampaign(selectedCampaign, true)}
              disabled={!form.scheduled_at}
              accessibilityRole="button"
              accessibilityLabel="Schedule send"
            >
              <Text style={styles.secondaryButtonText}>Schedule</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      <View style={styles.list}>
        {campaigns.map((campaign) => (
          <View key={campaign.public_id} style={styles.card}>
            <TouchableOpacity
              onPress={() =>
                navigation.navigate("OwnerMarketingCampaignDetail", {
                  publicId: campaign.public_id,
                  orgId,
                })
              }
              accessibilityRole="button"
              accessibilityLabel={`Open campaign ${campaign.name}`}
            >
              <Text style={styles.cardTitle}>{campaign.name}</Text>
            </TouchableOpacity>
            <Text style={styles.mutedText}>
              {campaign.status} • {campaign.sender_lane.replace(/_/g, " ")}
            </Text>
            <Text style={styles.mutedText}>
              Eligible {campaign.eligible_count} • Sent {campaign.sent_count} • Opened{" "}
              {campaign.opened_count}
              {campaign.scheduled_at
                ? ` • Scheduled ${new Date(campaign.scheduled_at).toLocaleString()}`
                : ""}
            </Text>
            {["draft", "scheduled"].includes(campaign.status) ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => reviewCampaign(campaign)}
                accessibilityRole="button"
                accessibilityLabel={`Review ${campaign.public_id}`}
              >
                <Text style={styles.secondaryButtonText}>Review</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function Chip({
  label,
  active,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <TouchableOpacity
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
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
    marginTop: 4,
    fontSize: 14,
    color: "#6B7280"
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#FFFFFF"
  },
  chipActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  chipText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#3730A3"
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  field: {
    gap: 5
  },
  label: {
    fontSize: 12,
    color: "#4B5563",
    fontWeight: "700"
  },
  input: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#FFFFFF"
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#4F46E5"
  },
  primaryButtonDisabled: {
    opacity: 0.5
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700"
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
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
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

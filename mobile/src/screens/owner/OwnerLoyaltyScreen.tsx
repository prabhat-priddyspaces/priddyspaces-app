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

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Organization = { public_id: string; name: string };

type LoyaltySettings = {
  is_enabled: boolean;
  accepts_priddy_points: boolean;
  owner_points_redemption_enabled: boolean;
  point_value_cents: number;
  earn_points_per_100_dollars: number;
  max_redemption_percent: number;
  allowed_space_types: string[];
  allowed_booking_modes: string[];
  promo_expiration_days: number;
  earned_expiration_days: number;
  campaign_daily_issue_cap: number;
  max_promo_grant_points: number;
};

type LoyaltyOwnerSummary = {
  points_issued: number;
  points_redeemed: number;
  outstanding_points: number;
  outstanding_liability_cents: number;
};

type LoyaltyCampaign = {
  public_id: string;
  name: string;
  campaign_type: string;
  status: string;
  budget_points: number | null;
  issued_points: number;
};

const CAMPAIGN_TYPES = [
  { value: "signup_bonus", label: "Signup bonus" },
  { value: "first_booking_bonus", label: "First booking bonus" },
  { value: "inactive_winback", label: "Inactive winback" },
  { value: "happy_hour", label: "Happy hour" },
  { value: "weekend_multiplier", label: "Weekend multiplier" },
  { value: "manual", label: "Manual campaign" },
];

const SPACE_TYPE_OPTIONS: Array<[string, string]> = [
  ["shared_desk", "Shared desk"],
  ["conference_room", "Conference room"],
  ["virtual_office", "Virtual office"],
  ["private_office", "Private office"],
  ["suite", "Suite"],
];

const BOOKING_MODE_OPTIONS: Array<[string, string]> = [
  ["day_pass", "Day pass"],
  ["hourly", "Hourly"],
];

const NUMERIC_FIELDS: Array<{ key: keyof LoyaltySettings; label: string }> = [
  { key: "point_value_cents", label: "Point value (cents)" },
  { key: "earn_points_per_100_dollars", label: "Points per $100" },
  { key: "max_redemption_percent", label: "Max redemption %" },
  { key: "promo_expiration_days", label: "Promo expiry (days)" },
  { key: "earned_expiration_days", label: "Earned expiry (days)" },
  { key: "campaign_daily_issue_cap", label: "Daily issue cap" },
  { key: "max_promo_grant_points", label: "Max promo grant" },
];

function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value / 100);
}

const SUCCESS_MESSAGES = new Set([
  "Loyalty settings saved",
  "Campaign saved",
  "Manual points granted",
]);

export function OwnerLoyaltyScreen() {
  const { token } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [summary, setSummary] = useState<LoyaltyOwnerSummary | null>(null);
  const [campaigns, setCampaigns] = useState<LoyaltyCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    campaign_type: "first_booking_bonus",
    point_type: "promo",
    points: "500",
    budget_points: "",
    status: "draft",
  });
  const [manualForm, setManualForm] = useState({
    user_public_id: "",
    point_type: "promo",
    points: "100",
    note: "",
  });

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        if (list[0]) setOrgId((current) => current || list[0].public_id);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  const load = useCallback(async () => {
    if (!token || !orgId) return;
    const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
    const [settingsResp, summaryResp, campaignsResp] = await Promise.all([
      apiFetch<LoyaltySettings>(`/api/loyalty/settings?${qs}`, { method: "GET" }, token),
      apiFetch<LoyaltyOwnerSummary>(`/api/loyalty/owner/summary?${qs}`, { method: "GET" }, token),
      apiFetch<LoyaltyCampaign[]>(`/api/loyalty/campaigns?${qs}`, { method: "GET" }, token),
    ]);
    setSettings(settingsResp);
    setSummary(summaryResp);
    setCampaigns(campaignsResp);
  }, [token, orgId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load loyalty"))
      .finally(() => setLoading(false));
  }, [load]);

  function updateSetting(field: keyof LoyaltySettings, value: number | boolean) {
    setSettings((current) => (current ? { ...current, [field]: value } : current));
  }

  function toggleSettingList(field: "allowed_space_types" | "allowed_booking_modes", value: string) {
    setSettings((current) => {
      if (!current) return current;
      const list = current[field] || [];
      const next = list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
      return { ...current, [field]: next };
    });
  }

  async function saveSettings() {
    if (!token || !settings) return;
    setSaving(true);
    setMessage("");
    try {
      const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
      const updated = await apiFetch<LoyaltySettings>(
        `/api/loyalty/settings?${qs}`,
        {
          method: "PUT",
          body: JSON.stringify({
            is_enabled: settings.is_enabled,
            accepts_priddy_points: settings.accepts_priddy_points,
            owner_points_redemption_enabled: settings.owner_points_redemption_enabled,
            point_value_cents: settings.point_value_cents,
            earn_points_per_100_dollars: settings.earn_points_per_100_dollars,
            max_redemption_percent: settings.max_redemption_percent,
            allowed_space_types: settings.allowed_space_types,
            allowed_booking_modes: settings.allowed_booking_modes,
            promo_expiration_days: settings.promo_expiration_days,
            earned_expiration_days: settings.earned_expiration_days,
            campaign_daily_issue_cap: settings.campaign_daily_issue_cap,
            max_promo_grant_points: settings.max_promo_grant_points,
          }),
        },
        token,
      );
      setSettings(updated);
      setMessage("Loyalty settings saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Settings save failed");
    } finally {
      setSaving(false);
    }
  }

  async function createCampaign() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/loyalty/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            name: campaignForm.name,
            campaign_type: campaignForm.campaign_type,
            status: campaignForm.status,
            reward_json: {
              point_type: campaignForm.point_type,
              points: Number(campaignForm.points || 0),
            },
            rules_json: {},
            budget_points: campaignForm.budget_points ? Number(campaignForm.budget_points) : null,
          }),
        },
        token,
      );
      setCampaignForm({ ...campaignForm, name: "" });
      setMessage("Campaign saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Campaign save failed");
    }
  }

  async function toggleCampaign(campaign: LoyaltyCampaign) {
    if (!token) return;
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    try {
      await apiFetch(
        `/api/loyalty/campaigns/${campaign.public_id}`,
        { method: "PATCH", body: JSON.stringify({ status: nextStatus }) },
        token,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Campaign update failed");
    }
  }

  async function manualGrant() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/loyalty/manual-adjustments",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            user_public_id: manualForm.user_public_id,
            point_type: manualForm.point_type,
            points: Number(manualForm.points || 0),
            note: manualForm.note,
          }),
        },
        token,
      );
      setManualForm({ user_public_id: "", point_type: "promo", points: "100", note: "" });
      setMessage("Manual points granted");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Manual grant failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Loyalty</Text>
      <Text style={styles.subtitle}>Points settings, campaigns, and manual grants per organization.</Text>

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

      {summary ? (
        <View style={styles.statsRow}>
          <Stat label="Points issued" value={String(summary.points_issued)} />
          <Stat label="Points redeemed" value={String(summary.points_redeemed)} />
          <Stat label="Outstanding" value={String(summary.outstanding_points)} />
          <Stat label="Liability" value={formatCents(summary.outstanding_liability_cents)} />
        </View>
      ) : null}

      {settings ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Program settings</Text>
          <View style={styles.chipRow}>
            <Chip
              label={settings.is_enabled ? "Enabled" : "Disabled"}
              active={settings.is_enabled}
              accessibilityLabel="Toggle program enabled"
              onPress={() => updateSetting("is_enabled", !settings.is_enabled)}
            />
            <Chip
              label="Accept Priddy Points"
              active={settings.accepts_priddy_points}
              accessibilityLabel="Toggle accepts priddy points"
              onPress={() => updateSetting("accepts_priddy_points", !settings.accepts_priddy_points)}
            />
            <Chip
              label="Owner redemption"
              active={settings.owner_points_redemption_enabled}
              accessibilityLabel="Toggle owner redemption"
              onPress={() =>
                updateSetting(
                  "owner_points_redemption_enabled",
                  !settings.owner_points_redemption_enabled,
                )
              }
            />
          </View>
          {NUMERIC_FIELDS.map((field) => (
            <View key={field.key} style={styles.field}>
              <Text style={styles.label}>{field.label}</Text>
              <TextInput
                accessibilityLabel={field.label}
                style={styles.input}
                value={String(settings[field.key] ?? 0)}
                onChangeText={(value) => updateSetting(field.key, Number(value) || 0)}
                keyboardType="number-pad"
              />
            </View>
          ))}
          <Text style={styles.label}>Allowed space types</Text>
          <View style={styles.chipRow}>
            {SPACE_TYPE_OPTIONS.map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                active={(settings.allowed_space_types || []).includes(value)}
                accessibilityLabel={`Allow ${label}`}
                onPress={() => toggleSettingList("allowed_space_types", value)}
              />
            ))}
          </View>
          <Text style={styles.label}>Allowed booking modes</Text>
          <View style={styles.chipRow}>
            {BOOKING_MODE_OPTIONS.map(([value, label]) => (
              <Chip
                key={value}
                label={label}
                active={(settings.allowed_booking_modes || []).includes(value)}
                accessibilityLabel={`Allow mode ${label}`}
                onPress={() => toggleSettingList("allowed_booking_modes", value)}
              />
            ))}
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={saveSettings}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Save loyalty settings"
          >
            {saving ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>Save settings</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Campaign builder</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Campaign name</Text>
          <TextInput
            accessibilityLabel="Campaign name"
            style={styles.input}
            value={campaignForm.name}
            onChangeText={(name) => setCampaignForm({ ...campaignForm, name })}
          />
        </View>
        <View style={styles.chipRow}>
          {CAMPAIGN_TYPES.map((type) => (
            <Chip
              key={type.value}
              label={type.label}
              active={campaignForm.campaign_type === type.value}
              accessibilityLabel={`Campaign type ${type.label}`}
              onPress={() => setCampaignForm({ ...campaignForm, campaign_type: type.value })}
            />
          ))}
        </View>
        <View style={styles.chipRow}>
          <Chip
            label="Promo points"
            active={campaignForm.point_type === "promo"}
            accessibilityLabel="Reward promo points"
            onPress={() => setCampaignForm({ ...campaignForm, point_type: "promo" })}
          />
          <Chip
            label="Earned points"
            active={campaignForm.point_type === "earned"}
            accessibilityLabel="Reward earned points"
            onPress={() => setCampaignForm({ ...campaignForm, point_type: "earned" })}
          />
          <Chip
            label={campaignForm.status === "active" ? "Active" : "Draft"}
            active={campaignForm.status === "active"}
            accessibilityLabel="Toggle campaign status"
            onPress={() =>
              setCampaignForm({
                ...campaignForm,
                status: campaignForm.status === "active" ? "draft" : "active",
              })
            }
          />
        </View>
        <View style={styles.row}>
          <View style={[styles.field, styles.rowItem]}>
            <Text style={styles.label}>Points</Text>
            <TextInput
              accessibilityLabel="Campaign points"
              style={styles.input}
              value={campaignForm.points}
              onChangeText={(points) => setCampaignForm({ ...campaignForm, points })}
              keyboardType="number-pad"
            />
          </View>
          <View style={[styles.field, styles.rowItem]}>
            <Text style={styles.label}>Budget points</Text>
            <TextInput
              accessibilityLabel="Budget points"
              style={styles.input}
              value={campaignForm.budget_points}
              onChangeText={(budget_points) => setCampaignForm({ ...campaignForm, budget_points })}
              keyboardType="number-pad"
            />
          </View>
        </View>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={createCampaign}
          accessibilityRole="button"
          accessibilityLabel="Create campaign"
        >
          <Text style={styles.primaryButtonText}>Create campaign</Text>
        </TouchableOpacity>
        {campaigns.map((campaign) => (
          <View key={campaign.public_id} style={styles.listRow}>
            <Text style={styles.listTitle}>{campaign.name}</Text>
            <Text style={styles.mutedText}>
              {campaign.campaign_type.replace(/_/g, " ")} • {campaign.status} •{" "}
              {campaign.issued_points} issued
              {campaign.budget_points != null ? ` / ${campaign.budget_points} budget` : ""}
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => toggleCampaign(campaign)}
              accessibilityRole="button"
              accessibilityLabel={`${campaign.status === "active" ? "Pause" : "Activate"} ${campaign.public_id}`}
            >
              <Text style={styles.secondaryButtonText}>
                {campaign.status === "active" ? "Pause" : "Activate"}
              </Text>
            </TouchableOpacity>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manual grant</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Member user ID</Text>
          <TextInput
            accessibilityLabel="Member user ID"
            style={styles.input}
            value={manualForm.user_public_id}
            onChangeText={(user_public_id) => setManualForm({ ...manualForm, user_public_id })}
            autoCapitalize="none"
          />
        </View>
        <View style={styles.chipRow}>
          <Chip
            label="Promo"
            active={manualForm.point_type === "promo"}
            accessibilityLabel="Grant promo points"
            onPress={() => setManualForm({ ...manualForm, point_type: "promo" })}
          />
          <Chip
            label="Earned"
            active={manualForm.point_type === "earned"}
            accessibilityLabel="Grant earned points"
            onPress={() => setManualForm({ ...manualForm, point_type: "earned" })}
          />
        </View>
        <View style={styles.row}>
          <View style={[styles.field, styles.rowItem]}>
            <Text style={styles.label}>Points</Text>
            <TextInput
              accessibilityLabel="Grant points"
              style={styles.input}
              value={manualForm.points}
              onChangeText={(points) => setManualForm({ ...manualForm, points })}
              keyboardType="number-pad"
            />
          </View>
          <View style={[styles.field, styles.rowItem]}>
            <Text style={styles.label}>Note</Text>
            <TextInput
              accessibilityLabel="Grant note"
              style={styles.input}
              value={manualForm.note}
              onChangeText={(note) => setManualForm({ ...manualForm, note })}
            />
          </View>
        </View>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={manualGrant}
          accessibilityRole="button"
          accessibilityLabel="Submit manual grant"
        >
          <Text style={styles.primaryButtonText}>Grant points</Text>
        </TouchableOpacity>
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

function Stat({ label, value }: { label: string; value: string }) {
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
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10
  },
  statCard: {
    flexGrow: 1,
    minWidth: 130,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    gap: 4
  },
  statValue: {
    fontSize: 17,
    fontWeight: "700",
    color: "#111827"
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
  row: {
    flexDirection: "row",
    gap: 8
  },
  rowItem: {
    flex: 1
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
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  },
  listRow: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    gap: 6
  },
  listTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827"
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

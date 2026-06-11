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
import { useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type Organization = { public_id: string; name: string };

type VerifiedSender = {
  public_id: string;
  email: string;
  name: string | null;
  status: string;
};

type SenderSettings = {
  default_sender_lane: string;
  allowed_lanes: string[];
  shared_daily_cap: number;
  verified_sender_daily_cap: number;
  shared_from_email: string;
  shared_from_name: string | null;
  verified_sender_public_id: string | null;
  verified_senders: VerifiedSender[];
};

const SUCCESS_MESSAGES = new Set([
  "Sender settings saved",
  "Verified sender requested",
  "Sender refreshed",
]);

export function OwnerMarketingSettingsScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>(route.params?.orgId || "");
  const [settings, setSettings] = useState<SenderSettings | null>(null);
  const [senderForm, setSenderForm] = useState({
    default_sender_lane: "shared",
    verified_sender_public_id: "",
  });
  const [verifiedForm, setVerifiedForm] = useState({ email: "", name: "" });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        setOrgId((current) => current || list[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  const loadSettings = useCallback(async () => {
    if (!token || !orgId) return;
    const result = await apiFetch<SenderSettings>(
      `/api/marketing/settings?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    );
    setSettings(result);
    setSenderForm({
      default_sender_lane: result.default_sender_lane,
      verified_sender_public_id: result.verified_sender_public_id || "",
    });
  }, [token, orgId]);

  useEffect(() => {
    setLoading(true);
    loadSettings()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load settings"))
      .finally(() => setLoading(false));
  }, [loadSettings]);

  async function saveSender() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/marketing/settings/sender",
        { method: "PUT", body: JSON.stringify({ organization_public_id: orgId, ...senderForm }) },
        token,
      );
      setMessage("Sender settings saved");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  async function addVerifiedSender() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/marketing/settings/verified-senders",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, ...verifiedForm }) },
        token,
      );
      setVerifiedForm({ email: "", name: "" });
      setMessage("Verified sender requested");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to request verified sender");
    }
  }

  async function refresh(publicId: string) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/marketing/settings/verified-senders/${publicId}/refresh`,
        { method: "POST" },
        token,
      );
      setMessage("Sender refreshed");
      await loadSettings();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Refresh failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Marketing settings</Text>
      <Text style={styles.subtitle}>Sender lanes, caps, and verified business senders.</Text>

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

      {settings ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Sender lane</Text>
          <Text style={styles.mutedText}>
            Shared: {settings.shared_from_name || "Priddyspaces"} &lt;{settings.shared_from_email}&gt; •
            cap {settings.shared_daily_cap}/day • Verified cap {settings.verified_sender_daily_cap}/day
          </Text>
          <View style={styles.chipRow}>
            {settings.allowed_lanes.map((lane) => (
              <Chip
                key={lane}
                label={lane.replace(/_/g, " ")}
                active={senderForm.default_sender_lane === lane}
                accessibilityLabel={`Lane ${lane}`}
                onPress={() => setSenderForm({ ...senderForm, default_sender_lane: lane })}
              />
            ))}
          </View>
          <Text style={styles.label}>Default verified sender</Text>
          <View style={styles.chipRow}>
            <Chip
              label="None"
              active={!senderForm.verified_sender_public_id}
              accessibilityLabel="Verified sender none"
              onPress={() => setSenderForm({ ...senderForm, verified_sender_public_id: "" })}
            />
            {settings.verified_senders.map((sender) => (
              <Chip
                key={sender.public_id}
                label={sender.email}
                active={senderForm.verified_sender_public_id === sender.public_id}
                accessibilityLabel={`Verified sender ${sender.email}`}
                onPress={() =>
                  setSenderForm({ ...senderForm, verified_sender_public_id: sender.public_id })
                }
              />
            ))}
          </View>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={saveSender}
            accessibilityRole="button"
            accessibilityLabel="Save sender settings"
          >
            <Text style={styles.primaryButtonText}>Save sender settings</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Request verified sender</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Verified sender email"
            style={styles.input}
            value={verifiedForm.email}
            onChangeText={(email) => setVerifiedForm({ ...verifiedForm, email })}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            accessibilityLabel="Verified sender name"
            style={styles.input}
            value={verifiedForm.name}
            onChangeText={(name) => setVerifiedForm({ ...verifiedForm, name })}
          />
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, !verifiedForm.email && styles.disabled]}
          onPress={addVerifiedSender}
          disabled={!verifiedForm.email}
          accessibilityRole="button"
          accessibilityLabel="Request verified sender"
        >
          <Text style={styles.primaryButtonText}>Request verification</Text>
        </TouchableOpacity>
        {(settings?.verified_senders || []).map((sender) => (
          <View key={sender.public_id} style={styles.listRow}>
            <Text style={styles.listTitle}>{sender.email}</Text>
            <Text style={styles.mutedText}>
              {sender.name || "—"} • {sender.status}
            </Text>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => refresh(sender.public_id)}
              accessibilityRole="button"
              accessibilityLabel={`Refresh ${sender.public_id}`}
            >
              <Text style={styles.secondaryButtonText}>Refresh status</Text>
            </TouchableOpacity>
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
    fontWeight: "700",
    textTransform: "capitalize"
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
    paddingVertical: 11,
    backgroundColor: "#4F46E5"
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
  disabled: {
    opacity: 0.5
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

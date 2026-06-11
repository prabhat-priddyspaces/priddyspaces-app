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

type Suppression = {
  public_id: string;
  email: string;
  reason: string;
  status: string;
  created_at: string | null;
};

const REASONS = ["manual", "unsubscribed", "bounced", "spam_report"];

const SUCCESS_MESSAGES = new Set(["Suppression added", "Recipient resubscribed"]);

export function OwnerMarketingSuppressionsScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>(route.params?.orgId || "");
  const [suppressions, setSuppressions] = useState<Suppression[]>([]);
  const [form, setForm] = useState({ email: "", reason: "manual" });
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

  const load = useCallback(async () => {
    if (!token || !orgId) return;
    const list = await apiFetch<Suppression[]>(
      `/api/marketing/suppressions?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    );
    setSuppressions(list);
  }, [token, orgId]);

  useEffect(() => {
    setLoading(true);
    load()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load suppressions"))
      .finally(() => setLoading(false));
  }, [load]);

  async function addSuppression() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/marketing/suppressions",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            email: form.email,
            reason: form.reason,
          }),
        },
        token,
      );
      setForm({ email: "", reason: "manual" });
      setMessage("Suppression added");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Add failed");
    }
  }

  async function resubscribe(publicId: string) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(`/api/marketing/suppressions/${publicId}/resubscribe`, { method: "POST" }, token);
      setMessage("Recipient resubscribed");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Resubscribe failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Suppressions</Text>
      <Text style={styles.subtitle}>Unsubscribes, bounces, spam reports, and manual blocks.</Text>

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
        <Text style={styles.sectionTitle}>Add suppression</Text>
        <View style={styles.field}>
          <Text style={styles.label}>Email</Text>
          <TextInput
            accessibilityLabel="Suppression email"
            style={styles.input}
            value={form.email}
            onChangeText={(email) => setForm({ ...form, email })}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>
        <View style={styles.chipRow}>
          {REASONS.map((reason) => (
            <Chip
              key={reason}
              label={reason.replace(/_/g, " ")}
              active={form.reason === reason}
              accessibilityLabel={`Reason ${reason}`}
              onPress={() => setForm({ ...form, reason })}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[styles.primaryButton, !form.email && styles.disabled]}
          onPress={addSuppression}
          disabled={!form.email}
          accessibilityRole="button"
          accessibilityLabel="Add suppression"
        >
          <Text style={styles.primaryButtonText}>Add suppression</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Suppressed recipients</Text>
        {suppressions.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No suppressions.</Text>
        ) : (
          suppressions.map((item) => (
            <View key={item.public_id} style={styles.listRow}>
              <Text style={styles.listTitle}>{item.email}</Text>
              <Text style={styles.mutedText}>
                {item.reason.replace(/_/g, " ")} • {item.status}
                {item.created_at ? ` • ${new Date(item.created_at).toLocaleDateString()}` : ""}
              </Text>
              {item.status === "active" ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => resubscribe(item.public_id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Resubscribe ${item.public_id}`}
                >
                  <Text style={styles.secondaryButtonText}>Resubscribe</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))
        )}
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

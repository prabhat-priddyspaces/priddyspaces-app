import { useEffect, useState } from "react";
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
type LocationOption = { public_id: string; name: string };
type SpaceOption = { public_id: string; name?: string | null; space_type: string };

type AssistantPolicy = {
  public_id: string;
  scope_type: string;
  category: string;
  title: string;
  body: string;
  source_url: string | null;
  is_active: boolean;
};

const SCOPE_TYPES = ["organization", "location", "space"] as const;
const CATEGORIES = [
  "parking",
  "wifi",
  "transit",
  "door_code",
  "cancellation",
  "guest_policy",
  "amenities",
  "support",
  "floor_plan",
];

export function OwnerAssistantPoliciesScreen() {
  const { token } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [policies, setPolicies] = useState<AssistantPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    scope_type: "organization" as (typeof SCOPE_TYPES)[number],
    scope_public_id: "",
    category: "parking",
    title: "",
    body: "",
    source_url: "",
  });

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    (async () => {
      const orgList = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(orgList);
      if (orgList[0]) {
        setForm((current) => ({ ...current, scope_public_id: orgList[0].public_id }));
        const locationList = await apiFetch<LocationOption[]>(
          `/api/locations?organization_public_id=${orgList[0].public_id}`,
          { method: "GET" },
          token,
        ).catch(() => []);
        setLocations(locationList);
        const spaceLists = await Promise.all(
          locationList.map((location) =>
            apiFetch<SpaceOption[]>(`/api/locations/${location.public_id}/spaces`, { method: "GET" }, token).catch(
              () => [],
            ),
          ),
        );
        setSpaces(spaceLists.flat());
      }
      const policyList = await apiFetch<AssistantPolicy[]>("/api/assistant/policies", { method: "GET" }, token);
      setPolicies(policyList);
    })()
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load policies"))
      .finally(() => setLoading(false));
  }, [token]);

  function scopeOptions(): { value: string; label: string }[] {
    if (form.scope_type === "location") {
      return locations.map((item) => ({ value: item.public_id, label: item.name }));
    }
    if (form.scope_type === "space") {
      return spaces.map((item) => ({
        value: item.public_id,
        label: item.name || item.space_type.replace("_", " "),
      }));
    }
    return orgs.map((item) => ({ value: item.public_id, label: item.name }));
  }

  function selectScopeType(nextType: (typeof SCOPE_TYPES)[number]) {
    const nextOptions = nextType === "location" ? locations : nextType === "space" ? spaces : orgs;
    setForm((current) => ({
      ...current,
      scope_type: nextType,
      scope_public_id: nextOptions[0]?.public_id || "",
    }));
  }

  async function submit() {
    if (!token) return;
    if (!form.title.trim() || !form.body.trim()) {
      setMessage("Title and policy text are required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const created = await apiFetch<AssistantPolicy>(
        "/api/assistant/policies",
        {
          method: "POST",
          body: JSON.stringify({ ...form, source_url: form.source_url || null }),
        },
        token,
      );
      setPolicies((current) => [created, ...current]);
      setForm((current) => ({ ...current, title: "", body: "", source_url: "" }));
      setMessage("Policy saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save policy");
    } finally {
      setSaving(false);
    }
  }

  async function archive(publicId: string) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(`/api/assistant/policies/${publicId}`, { method: "DELETE" }, token);
      setPolicies((current) =>
        current.map((item) => (item.public_id === publicId ? { ...item, is_active: false } : item)),
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to archive policy");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Assistant Policies</Text>
      <Text style={styles.subtitle}>
        Configure the structured source material the assistant cites for policy answers.
      </Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Policy saved." ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.label}>Scope</Text>
        <View style={styles.chipRow}>
          {SCOPE_TYPES.map((scope) => (
            <Chip
              key={scope}
              label={scope}
              active={form.scope_type === scope}
              accessibilityLabel={`Scope ${scope}`}
              onPress={() => selectScopeType(scope)}
            />
          ))}
        </View>
        <Text style={styles.label}>Record</Text>
        <View style={styles.chipRow}>
          {scopeOptions().map((item) => (
            <Chip
              key={item.value}
              label={item.label}
              active={form.scope_public_id === item.value}
              accessibilityLabel={`Record ${item.label}`}
              onPress={() => setForm((current) => ({ ...current, scope_public_id: item.value }))}
            />
          ))}
        </View>
        <Text style={styles.label}>Category</Text>
        <View style={styles.chipRow}>
          {CATEGORIES.map((category) => (
            <Chip
              key={category}
              label={category.replace(/_/g, " ")}
              active={form.category === category}
              accessibilityLabel={`Category ${category}`}
              onPress={() => setForm((current) => ({ ...current, category }))}
            />
          ))}
        </View>
        <Text style={styles.label}>Title</Text>
        <TextInput
          accessibilityLabel="Policy title"
          style={styles.input}
          value={form.title}
          onChangeText={(title) => setForm((current) => ({ ...current, title }))}
        />
        <Text style={styles.label}>Policy Text</Text>
        <TextInput
          accessibilityLabel="Policy text"
          style={[styles.input, styles.multiline]}
          value={form.body}
          onChangeText={(body) => setForm((current) => ({ ...current, body }))}
          multiline
        />
        <Text style={styles.label}>Source URL</Text>
        <TextInput
          accessibilityLabel="Source URL"
          style={styles.input}
          value={form.source_url}
          onChangeText={(source_url) => setForm((current) => ({ ...current, source_url }))}
          autoCapitalize="none"
          keyboardType="url"
        />
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={submit}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save policy"
        >
          {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save Policy</Text>}
        </TouchableOpacity>
      </View>

      <View style={styles.list}>
        {policies.map((policy) => (
          <View key={policy.public_id} style={[styles.card, !policy.is_active && styles.cardArchived]}>
            <Text style={styles.scopeText}>
              {policy.scope_type} • {policy.category}
            </Text>
            <Text style={styles.cardTitle}>{policy.title}</Text>
            <Text style={styles.cardBody}>{policy.body}</Text>
            {policy.is_active ? (
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => archive(policy.public_id)}
                accessibilityRole="button"
                accessibilityLabel={`Archive ${policy.public_id}`}
              >
                <Text style={styles.secondaryButtonText}>Archive</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.mutedText}>Archived</Text>
            )}
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
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 8
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
  label: {
    marginTop: 4,
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
  multiline: {
    minHeight: 100,
    textAlignVertical: "top"
  },
  primaryButton: {
    marginTop: 6,
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
  cardArchived: {
    opacity: 0.6
  },
  scopeText: {
    fontSize: 11,
    color: "#6B7280",
    textTransform: "uppercase",
    fontWeight: "700"
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827"
  },
  cardBody: {
    fontSize: 13,
    color: "#374151"
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

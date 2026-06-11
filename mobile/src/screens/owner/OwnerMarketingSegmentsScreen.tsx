import { useEffect, useMemo, useState } from "react";
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

type Segment = {
  public_id: string;
  name: string;
  description: string | null;
};

type Preview = { total: number; sample: Array<Record<string, unknown>> } | null;

export function OwnerMarketingSegmentsScreen() {
  const { token } = useAuth();
  const route = useRoute<any>();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState<string>(route.params?.orgId || "");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [preview, setPreview] = useState<Preview>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    name: "",
    description: "",
    status: "active",
    search: "",
    tags: "",
    tag_mode: "any",
    active_subscription: "any",
    min_booking_count: "",
    min_lifetime_revenue_cents: "",
    last_booking_after: "",
  });

  const filters = useMemo(() => {
    const output: Record<string, unknown> = {};
    if (form.status !== "any") output.status = form.status;
    if (form.search.trim()) output.search = form.search.trim();
    const tags = form.tags
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    if (tags.length) {
      output.tags = tags;
      output.tag_mode = form.tag_mode;
    }
    if (form.active_subscription !== "any") {
      output.active_subscription = form.active_subscription === "true";
    }
    if (form.min_booking_count) output.min_booking_count = Number(form.min_booking_count);
    if (form.min_lifetime_revenue_cents) {
      output.min_lifetime_revenue_cents = Number(form.min_lifetime_revenue_cents);
    }
    if (form.last_booking_after) output.last_booking_after = form.last_booking_after;
    return output;
  }, [form]);

  useEffect(() => {
    if (!token) return;
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        setOrgId((current) => current || list[0]?.public_id || "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, [token]);

  useEffect(() => {
    if (!token || !orgId) return;
    setLoading(true);
    apiFetch<Segment[]>(
      `/api/marketing/segments?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    )
      .then(setSegments)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load segments"))
      .finally(() => setLoading(false));
  }, [token, orgId]);

  async function previewCount() {
    if (!token) return;
    setMessage("");
    try {
      const result = await apiFetch<Preview>(
        "/api/marketing/segments/preview-count",
        { method: "POST", body: JSON.stringify({ organization_public_id: orgId, filters }) },
        token,
      );
      setPreview(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Preview failed");
    }
  }

  async function saveSegment() {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        "/api/marketing/segments",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            name: form.name,
            description: form.description,
            filters,
          }),
        },
        token,
      );
      setMessage("Segment saved");
      const list = await apiFetch<Segment[]>(
        `/api/marketing/segments?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "GET" },
        token,
      );
      setSegments(list);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Segments</Text>
      <Text style={styles.subtitle}>Saved member filters for owner marketing campaigns and workflows.</Text>

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
        <Text style={message === "Segment saved" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Segment builder</Text>
        <Field label="Name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field
          label="Description"
          value={form.description}
          onChange={(description) => setForm({ ...form, description })}
        />
        <Text style={styles.label}>Member status</Text>
        <View style={styles.chipRow}>
          {["any", "lead", "active", "churned", "blocked"].map((status) => (
            <Chip
              key={status}
              label={status}
              active={form.status === status}
              accessibilityLabel={`Filter status ${status}`}
              onPress={() => setForm({ ...form, status })}
            />
          ))}
        </View>
        <Field
          label="Search text"
          value={form.search}
          onChange={(search) => setForm({ ...form, search })}
        />
        <Field
          label="Tags (comma separated)"
          value={form.tags}
          onChange={(tags) => setForm({ ...form, tags })}
        />
        <View style={styles.chipRow}>
          <Chip
            label="Match any tag"
            active={form.tag_mode === "any"}
            accessibilityLabel="Tag mode any"
            onPress={() => setForm({ ...form, tag_mode: "any" })}
          />
          <Chip
            label="Match all tags"
            active={form.tag_mode === "all"}
            accessibilityLabel="Tag mode all"
            onPress={() => setForm({ ...form, tag_mode: "all" })}
          />
        </View>
        <Text style={styles.label}>Active subscription</Text>
        <View style={styles.chipRow}>
          {[
            ["any", "Any"],
            ["true", "Has subscription"],
            ["false", "No subscription"],
          ].map(([value, label]) => (
            <Chip
              key={value}
              label={label}
              active={form.active_subscription === value}
              accessibilityLabel={`Subscription ${label}`}
              onPress={() => setForm({ ...form, active_subscription: value })}
            />
          ))}
        </View>
        <Field
          label="Min booking count"
          value={form.min_booking_count}
          onChange={(min_booking_count) => setForm({ ...form, min_booking_count })}
          keyboardType="number-pad"
        />
        <Field
          label="Min lifetime revenue (cents)"
          value={form.min_lifetime_revenue_cents}
          onChange={(min_lifetime_revenue_cents) => setForm({ ...form, min_lifetime_revenue_cents })}
          keyboardType="number-pad"
        />
        <Field
          label="Last booking after (YYYY-MM-DD)"
          value={form.last_booking_after}
          onChange={(last_booking_after) => setForm({ ...form, last_booking_after })}
        />
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={previewCount}
            accessibilityRole="button"
            accessibilityLabel="Preview count"
          >
            <Text style={styles.secondaryButtonText}>Preview count</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.primaryButton, !form.name && styles.disabled]}
            onPress={saveSegment}
            disabled={!form.name}
            accessibilityRole="button"
            accessibilityLabel="Save segment"
          >
            <Text style={styles.primaryButtonText}>Save segment</Text>
          </TouchableOpacity>
        </View>
        {preview ? <Text style={styles.mutedText}>Matches {preview.total} members.</Text> : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Saved segments</Text>
        {segments.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No segments yet.</Text>
        ) : (
          segments.map((segment) => (
            <View key={segment.public_id} style={styles.listRow}>
              <Text style={styles.listTitle}>{segment.name}</Text>
              {segment.description ? <Text style={styles.mutedText}>{segment.description}</Text> : null}
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

function Field({
  label,
  value,
  onChange,
  keyboardType,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "number-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize="none"
      />
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

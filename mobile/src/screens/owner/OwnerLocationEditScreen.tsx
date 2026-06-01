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
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type LocationStatus = "active" | "inactive";

type Location = {
  public_id: string;
  name: string;
  address: string;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  neighborhood?: string | null;
  timezone: string;
  status: LocationStatus;
  booking_granularity?: string;
};

export function OwnerLocationEditScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { locationId } = route.params || {};
  const [form, setForm] = useState({
    name: "",
    address: "",
    city: "",
    state: "",
    postal_code: "",
    timezone: "",
    status: "active" as LocationStatus,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !locationId) return;
    setLoading(true);
    setMessage("");
    apiFetch<Location>(`/api/locations/${locationId}`, { method: "GET" }, token)
      .then((location) => {
        setForm({
          name: location.name || "",
          address: location.address || "",
          city: location.city || "",
          state: location.state || "",
          postal_code: location.postal_code || "",
          timezone: location.timezone || "",
          status: location.status || "active",
        });
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load location"))
      .finally(() => setLoading(false));
  }, [locationId, token]);

  async function handleSave() {
    if (!token || !locationId) return;
    if (!form.name.trim() || !form.address.trim() || !form.timezone.trim()) {
      setMessage("Name, address, and timezone are required.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(
        `/api/locations/${locationId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name.trim(),
            address: form.address.trim(),
            city: form.city.trim() || null,
            state: form.state.trim() || null,
            postal_code: form.postal_code.trim() || null,
            timezone: form.timezone.trim(),
            status: form.status,
          }),
        },
        token,
      );
      setMessage("Location updated");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Edit location</Text>
          <Text style={styles.subtitle}>Update marketplace status and address details.</Text>
        </View>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.secondaryButtonText}>Back</Text>
        </TouchableOpacity>
      </View>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={message === "Location updated" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Status</Text>
        <View style={styles.row}>
          <ModeButton
            label="Active"
            active={form.status === "active"}
            onPress={() => setForm({ ...form, status: "active" })}
            accessibilityLabel="Set location active"
          />
          <ModeButton
            label="Inactive"
            active={form.status === "inactive"}
            onPress={() => setForm({ ...form, status: "inactive" })}
            accessibilityLabel="Set location inactive"
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Field label="Location name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        <Field label="Address" value={form.address} onChange={(address) => setForm({ ...form, address })} />
        <View style={styles.row}>
          <Field label="City" value={form.city} onChange={(city) => setForm({ ...form, city })} />
          <Field label="State" value={form.state} onChange={(state) => setForm({ ...form, state })} />
        </View>
        <View style={styles.row}>
          <Field
            label="Postal code"
            value={form.postal_code}
            onChange={(postal_code) => setForm({ ...form, postal_code })}
          />
          <Field label="Timezone" value={form.timezone} onChange={(timezone) => setForm({ ...form, timezone })} />
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving || loading}>
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save changes</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput accessibilityLabel={label} value={value} onChangeText={onChange} style={styles.input} />
    </View>
  );
}

function ModeButton({
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
      style={[styles.modeButton, active && styles.modeButtonActive]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
    >
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB"
  },
  content: {
    padding: 20,
    gap: 14
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
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
    gap: 12
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  field: {
    gap: 5,
    flexGrow: 1,
    minWidth: 120
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
  modeButton: {
    borderWidth: 1,
    borderColor: "#D1D5DB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF"
  },
  modeButtonActive: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  modeButtonText: {
    color: "#4B5563",
    fontSize: 12,
    fontWeight: "700"
  },
  modeButtonTextActive: {
    color: "#3730A3"
  },
  primaryButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 13,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700"
  },
  secondaryButton: {
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

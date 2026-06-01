import { useMemo, useState } from "react";
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

type SpaceType = "conference_room" | "shared_desk" | "private_office" | "suite" | "virtual_office";
type Visibility = "public" | "unlisted" | "private";

const SPACE_TYPE_OPTIONS: Array<{ value: SpaceType; label: string }> = [
  { value: "conference_room", label: "Conference room" },
  { value: "shared_desk", label: "Shared desk" },
  { value: "private_office", label: "Private office" },
  { value: "suite", label: "Suite" },
  { value: "virtual_office", label: "Virtual office" },
];

const VISIBILITY_OPTIONS: Array<{ value: Visibility; label: string }> = [
  { value: "public", label: "Public" },
  { value: "unlisted", label: "Unlisted" },
  { value: "private", label: "Private" },
];

export function OwnerAddSpaceScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { locationId, locationName } = route.params || {};
  const [form, setForm] = useState({
    name: "",
    space_type: "conference_room" as SpaceType,
    capacity: "4",
    price_daily: "",
    price_hourly: "",
    availability_start_time: "",
    availability_end_time: "",
    buffer_before_minutes: "0",
    buffer_after_minutes: "0",
    visibility: "public" as Visibility,
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const config = useMemo(() => typeConfig(form.space_type), [form.space_type]);

  async function handleSave() {
    if (!token || !locationId) {
      setMessage("Choose a location before creating a space.");
      return;
    }
    const capacity = form.space_type === "virtual_office" ? 1 : Number.parseInt(form.capacity, 10);
    if (!Number.isFinite(capacity) || capacity < 1) {
      setMessage("Capacity must be at least 1.");
      return;
    }

    setSaving(true);
    setMessage("");
    try {
      await apiFetch(
        "/api/spaces",
        {
          method: "POST",
          body: JSON.stringify({
            location_public_id: locationId,
            name: form.name.trim() || undefined,
            space_type: form.space_type,
            capacity,
            price_monthly: null,
            price_daily: config.showDaily ? moneyPayload(form.price_daily) : null,
            price_hourly: config.showHourly ? moneyPayload(form.price_hourly) : null,
            availability_start_time: config.showAvailability ? form.availability_start_time || null : null,
            availability_end_time: config.showAvailability ? form.availability_end_time || null : null,
            buffer_before_minutes: config.showBuffers ? Number.parseInt(form.buffer_before_minutes, 10) || 0 : 0,
            buffer_after_minutes: config.showBuffers ? Number.parseInt(form.buffer_after_minutes, 10) || 0 : 0,
            visibility: form.visibility,
          }),
        },
        token,
      );
      setMessage("Space created");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to create space");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Add space</Text>
          <Text style={styles.subtitle}>{locationName || "Create a room or desk for this location."}</Text>
        </View>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => navigation.navigate("OwnerLocationRooms", { locationId, name: locationName })}
          accessibilityRole="button"
          accessibilityLabel="Back to rooms"
          disabled={!locationId}
        >
          <Text style={styles.secondaryButtonText}>Rooms</Text>
        </TouchableOpacity>
      </View>

      {message ? <Text style={message === "Space created" ? styles.successMessage : styles.message}>{message}</Text> : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Space type</Text>
        <View style={styles.optionGrid}>
          {SPACE_TYPE_OPTIONS.map((option) => (
            <ModeButton
              key={option.value}
              label={option.label}
              active={form.space_type === option.value}
              onPress={() =>
                setForm((current) => ({
                  ...current,
                  space_type: option.value,
                  capacity: option.value === "virtual_office" ? "1" : current.capacity || "1",
                }))
              }
              accessibilityLabel={`Set space type ${option.label}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Field label="Space name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
        {form.space_type !== "virtual_office" ? (
          <Field
            label="Capacity"
            value={form.capacity}
            onChange={(capacity) => setForm({ ...form, capacity })}
            keyboardType="number-pad"
          />
        ) : null}
        {config.showHourly ? (
          <Field
            label="Hourly price"
            value={form.price_hourly}
            onChange={(price_hourly) => setForm({ ...form, price_hourly })}
            keyboardType="decimal-pad"
          />
        ) : null}
        {config.showDaily ? (
          <Field
            label="Daily price"
            value={form.price_daily}
            onChange={(price_daily) => setForm({ ...form, price_daily })}
            keyboardType="decimal-pad"
          />
        ) : null}
        {config.showAvailability ? (
          <View style={styles.row}>
            <Field
              label="Start time"
              value={form.availability_start_time}
              onChange={(availability_start_time) => setForm({ ...form, availability_start_time })}
            />
            <Field
              label="End time"
              value={form.availability_end_time}
              onChange={(availability_end_time) => setForm({ ...form, availability_end_time })}
            />
          </View>
        ) : null}
        {config.showBuffers ? (
          <View style={styles.row}>
            <Field
              label="Buffer before"
              value={form.buffer_before_minutes}
              onChange={(buffer_before_minutes) => setForm({ ...form, buffer_before_minutes })}
              keyboardType="number-pad"
            />
            <Field
              label="Buffer after"
              value={form.buffer_after_minutes}
              onChange={(buffer_after_minutes) => setForm({ ...form, buffer_after_minutes })}
              keyboardType="number-pad"
            />
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Visibility</Text>
        <View style={styles.optionGrid}>
          {VISIBILITY_OPTIONS.map((option) => (
            <ModeButton
              key={option.value}
              label={option.label}
              active={form.visibility === option.value}
              onPress={() => setForm({ ...form, visibility: option.value })}
              accessibilityLabel={`Set visibility ${option.label}`}
            />
          ))}
        </View>
      </View>

      <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Create space</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function typeConfig(spaceType: SpaceType) {
  if (spaceType === "conference_room") {
    return { showHourly: true, showDaily: true, showAvailability: true, showBuffers: true };
  }
  if (spaceType === "shared_desk") {
    return { showHourly: false, showDaily: true, showAvailability: true, showBuffers: false };
  }
  return { showHourly: false, showDaily: false, showAvailability: false, showBuffers: false };
}

function moneyPayload(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
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
  keyboardType?: "default" | "number-pad" | "decimal-pad";
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        style={styles.input}
      />
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
  optionGrid: {
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

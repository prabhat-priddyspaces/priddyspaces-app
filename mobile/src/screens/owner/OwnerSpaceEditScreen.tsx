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
import { useNavigation, useRoute } from "@react-navigation/native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type SpaceType = "conference_room" | "shared_desk" | "private_office" | "suite" | "virtual_office";
type Visibility = "public" | "unlisted" | "private";
type AvailabilityStatus = "available" | "occupied" | "maintenance";

type Space = {
  public_id: string;
  name: string;
  space_type: SpaceType;
  capacity: number;
  price_monthly: number | string | null;
  price_daily: number | string | null;
  price_hourly: number | string | null;
  availability_status: AvailabilityStatus;
  availability_start_time: string | null;
  availability_end_time: string | null;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  visibility: Visibility;
};

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

const AVAILABILITY_OPTIONS: Array<{ value: AvailabilityStatus; label: string }> = [
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "maintenance", label: "Maintenance" },
];

export function OwnerSpaceEditScreen() {
  const { token } = useAuth();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { spaceId } = route.params || {};
  const [form, setForm] = useState({
    name: "",
    space_type: "conference_room" as SpaceType,
    capacity: "1",
    price_daily: "",
    price_hourly: "",
    availability_status: "available" as AvailabilityStatus,
    availability_start_time: "",
    availability_end_time: "",
    buffer_before_minutes: "0",
    buffer_after_minutes: "0",
    visibility: "public" as Visibility,
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const config = useMemo(() => typeConfig(form.space_type), [form.space_type]);

  const isValid = useMemo(() => {
    if (!spaceId) return false;
    if (form.space_type !== "virtual_office") {
      const capacity = Number.parseInt(form.capacity, 10);
      if (!Number.isFinite(capacity) || capacity < 1) return false;
    }
    if (config.requireHourly && !(Number(form.price_hourly) > 0)) return false;
    if (config.requireDaily && !(Number(form.price_daily) > 0)) return false;
    return true;
  }, [spaceId, form.space_type, form.capacity, form.price_hourly, form.price_daily, config]);

  useEffect(() => {
    if (!token || !spaceId) return;
    setLoading(true);
    setMessage("");
    apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }, token)
      .then((space) => {
        setForm({
          name: space.name || "",
          space_type: space.space_type,
          capacity: String(space.capacity ?? 1),
          price_daily: space.price_daily != null ? String(space.price_daily) : "",
          price_hourly: space.price_hourly != null ? String(space.price_hourly) : "",
          availability_status: space.availability_status || "available",
          availability_start_time: space.availability_start_time || "",
          availability_end_time: space.availability_end_time || "",
          buffer_before_minutes: String(space.buffer_before_minutes ?? 0),
          buffer_after_minutes: String(space.buffer_after_minutes ?? 0),
          visibility: space.visibility || "public",
        });
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load space"))
      .finally(() => setLoading(false));
  }, [token, spaceId]);

  async function handleSave() {
    if (!token || !spaceId || !isValid) return;
    setSaving(true);
    setMessage("");
    try {
      await apiFetch(
        `/api/spaces/${spaceId}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name: form.name,
            space_type: form.space_type,
            capacity: form.space_type === "virtual_office" ? 1 : Number.parseInt(form.capacity, 10) || 1,
            // Web's edit form never exposes monthly pricing; it always nulls it.
            price_monthly: null,
            price_daily: config.showDaily ? moneyPayload(form.price_daily) : null,
            price_hourly: config.showHourly ? moneyPayload(form.price_hourly) : null,
            availability_status: form.availability_status,
            availability_start_time: config.showAvailability ? form.availability_start_time || null : null,
            availability_end_time: config.showAvailability ? form.availability_end_time || null : null,
            buffer_before_minutes: config.showBuffers ? Number.parseInt(form.buffer_before_minutes, 10) || 0 : 0,
            buffer_after_minutes: config.showBuffers ? Number.parseInt(form.buffer_after_minutes, 10) || 0 : 0,
            visibility: form.visibility,
          }),
        },
        token,
      );
      setMessage("Space updated");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to update space");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Edit Space</Text>
          <Text style={styles.subtitle}>Update space type, pricing, and availability.</Text>
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
        <Text style={message === "Space updated" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Space type</Text>
        <View style={styles.optionGrid}>
          {SPACE_TYPE_OPTIONS.map((option) => (
            <ModeButton
              key={option.value}
              label={option.label}
              active={form.space_type === option.value}
              onPress={() => {
                setMessage("");
                setForm((current) => ({
                  ...current,
                  space_type: option.value,
                  capacity: option.value === "virtual_office" ? "1" : current.capacity || "1",
                }));
              }}
              accessibilityLabel={`Set space type ${option.label}`}
            />
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <Field label="Listing name" value={form.name} onChange={(name) => setForm({ ...form, name })} />
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
            required={config.requireHourly}
            value={form.price_hourly}
            onChange={(price_hourly) => setForm({ ...form, price_hourly })}
            keyboardType="decimal-pad"
          />
        ) : null}
        {config.showDaily ? (
          <Field
            label={config.dailyLabel}
            required={config.requireDaily}
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
        <Text style={styles.sectionTitle}>Availability</Text>
        <View style={styles.optionGrid}>
          {AVAILABILITY_OPTIONS.map((option) => (
            <ModeButton
              key={option.value}
              label={option.label}
              active={form.availability_status === option.value}
              onPress={() => setForm({ ...form, availability_status: option.value })}
              accessibilityLabel={`Set availability ${option.label}`}
            />
          ))}
        </View>
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
        <Text style={styles.helperText}>
          Amenities are assigned on the location. Update them from the location editor if this room
          should expose different amenities.
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, (!isValid || saving || loading) && styles.primaryButtonDisabled]}
        onPress={handleSave}
        disabled={!isValid || saving || loading}
        accessibilityRole="button"
        accessibilityLabel="Save changes"
        accessibilityState={{ disabled: !isValid || saving || loading }}
      >
        {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>Save Changes</Text>}
      </TouchableOpacity>

      {form.space_type === "conference_room" || form.space_type === "shared_desk" ? (
        <VolumeDiscountsSection spaceId={spaceId} token={token} />
      ) : null}
      <SetupFeesSection spaceId={spaceId} token={token} />
    </ScrollView>
  );
}

type VolumeTier = { min_hours: number; discount_percent: number; is_active: boolean };
type VolumeDraft = { min_hours: string; discount_percent: string };

function VolumeDiscountsSection({ spaceId, token }: { spaceId?: string; token: string | null }) {
  const [rows, setRows] = useState<VolumeDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !spaceId) return;
    apiFetch<VolumeTier[]>(`/api/spaces/${spaceId}/volume-discounts`, { method: "GET" }, token)
      .then((tiers) =>
        setRows(
          tiers.map((tier) => ({
            min_hours: String(tier.min_hours),
            discount_percent: String(tier.discount_percent),
          })),
        ),
      )
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load tiers"));
  }, [token, spaceId]);

  async function save() {
    if (!token || !spaceId) return;
    setSaving(true);
    setMessage("");
    try {
      const tiers = rows
        .map((row) => ({
          min_hours: Number(row.min_hours),
          discount_percent: Number(row.discount_percent),
          is_active: true,
        }))
        .filter((tier) => tier.min_hours > 0 && tier.discount_percent > 0 && tier.discount_percent < 100);
      await apiFetch(
        `/api/spaces/${spaceId}/volume-discounts`,
        { method: "PUT", body: JSON.stringify({ tiers }) },
        token,
      );
      setMessage("Tiers saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Volume discounts</Text>
      <Text style={styles.helperText}>
        Reward longer hourly bookings. Members booking at least the minimum hours get the discount
        automatically. Hourly bookings only.
      </Text>
      {rows.length === 0 ? <Text style={styles.helperText}>No discount tiers yet.</Text> : null}
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <Field
            label={`Min hours ${index + 1}`}
            value={row.min_hours}
            onChange={(value) =>
              setRows((current) => current.map((r, i) => (i === index ? { ...r, min_hours: value } : r)))
            }
            keyboardType="number-pad"
          />
          <Field
            label={`Discount % ${index + 1}`}
            value={row.discount_percent}
            onChange={(value) =>
              setRows((current) =>
                current.map((r, i) => (i === index ? { ...r, discount_percent: value } : r)),
              )
            }
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setRows((current) => current.filter((_, i) => i !== index))}
            accessibilityRole="button"
            accessibilityLabel={`Remove tier ${index + 1}`}
          >
            <Text style={styles.secondaryButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setRows((current) => [...current, { min_hours: "", discount_percent: "" }])}
          accessibilityRole="button"
          accessibilityLabel="Add tier"
        >
          <Text style={styles.secondaryButtonText}>Add tier</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save tiers"
        >
          <Text style={styles.secondaryButtonText}>{saving ? "Saving…" : "Save tiers"}</Text>
        </TouchableOpacity>
      </View>
      {message ? (
        <Text style={message === "Tiers saved" ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}
    </View>
  );
}

type SetupFeeItem = { label: string; amount_cents: number; is_active: boolean; sort_order: number };
type SetupFeeDraft = { label: string; amount: string };

function formatFeeAmount(cents: number) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function SetupFeesSection({ spaceId, token }: { spaceId?: string; token: string | null }) {
  const [rows, setRows] = useState<SetupFeeDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token || !spaceId) return;
    apiFetch<SetupFeeItem[]>(`/api/spaces/${spaceId}/setup-fees`, { method: "GET" }, token)
      .then((items) =>
        setRows(
          items
            .filter((item) => item.is_active)
            .map((item) => ({ label: item.label, amount: formatFeeAmount(item.amount_cents) })),
        ),
      )
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load setup fees"));
  }, [token, spaceId]);

  async function save() {
    if (!token || !spaceId) return;
    setSaving(true);
    setMessage("");
    try {
      const items = rows
        .map((row, index) => ({
          label: row.label.trim(),
          amount_cents: Math.round(Number(row.amount) * 100),
          is_active: true,
          sort_order: index,
        }))
        .filter((item) => item.label && item.amount_cents > 0);
      await apiFetch(
        `/api/spaces/${spaceId}/setup-fees`,
        { method: "PUT", body: JSON.stringify({ items }) },
        token,
      );
      setRows(items.map((item) => ({ label: item.label, amount: formatFeeAmount(item.amount_cents) })));
      setMessage("Setup fees saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>One-time setup fees</Text>
      <Text style={styles.helperText}>
        Mandatory setup costs shown before checkout and charged once per booking request.
      </Text>
      {rows.length === 0 ? <Text style={styles.helperText}>No setup fees yet.</Text> : null}
      {rows.map((row, index) => (
        <View key={index} style={styles.row}>
          <Field
            label={`Line item ${index + 1}`}
            value={row.label}
            onChange={(value) =>
              setRows((current) => current.map((r, i) => (i === index ? { ...r, label: value } : r)))
            }
          />
          <Field
            label={`Amount $ ${index + 1}`}
            value={row.amount}
            onChange={(value) =>
              setRows((current) => current.map((r, i) => (i === index ? { ...r, amount: value } : r)))
            }
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => setRows((current) => current.filter((_, i) => i !== index))}
            accessibilityRole="button"
            accessibilityLabel={`Remove fee ${index + 1}`}
          >
            <Text style={styles.secondaryButtonText}>Remove</Text>
          </TouchableOpacity>
        </View>
      ))}
      <View style={styles.row}>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setRows((current) => [...current, { label: "", amount: "" }])}
          accessibilityRole="button"
          accessibilityLabel="Add fee"
        >
          <Text style={styles.secondaryButtonText}>Add fee</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={save}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save setup fees"
        >
          <Text style={styles.secondaryButtonText}>{saving ? "Saving..." : "Save setup fees"}</Text>
        </TouchableOpacity>
      </View>
      {message ? (
        <Text style={message === "Setup fees saved" ? styles.successMessage : styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

function typeConfig(spaceType: SpaceType) {
  if (spaceType === "conference_room") {
    return {
      showHourly: true,
      requireHourly: true,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day rate price",
      showAvailability: true,
      showBuffers: true,
    };
  }
  if (spaceType === "shared_desk") {
    return {
      showHourly: false,
      requireHourly: false,
      showDaily: true,
      requireDaily: true,
      dailyLabel: "Day pass price",
      showAvailability: true,
      showBuffers: false,
    };
  }
  return {
    showHourly: false,
    requireHourly: false,
    showDaily: false,
    requireDaily: false,
    dailyLabel: "Daily price",
    showAvailability: false,
    showBuffers: false,
  };
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
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  keyboardType?: "default" | "number-pad" | "decimal-pad";
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? " *" : ""}
      </Text>
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
  helperText: {
    fontSize: 12,
    color: "#6B7280"
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
  primaryButtonDisabled: {
    opacity: 0.5
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

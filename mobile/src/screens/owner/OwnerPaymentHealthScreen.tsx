import { useCallback, useEffect, useMemo, useState } from "react";
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

type PaymentHealthNotice = {
  status: string;
  sent_at: string | null;
};

type PaymentHealthCard = {
  public_id: string;
  member_name: string | null;
  member_email: string | null;
  provider: string;
  card_status: "expired" | "expiring" | "missing_expiry" | "healthy";
  card_brand: string | null;
  card_last4: string | null;
  expiry_label: string | null;
  open_booking_request_count: number;
  future_booking_count: number;
  active_subscription_count: number;
  upcoming_booking_value_cents: number;
  recent_paid_volume_cents: number;
  last_notice: PaymentHealthNotice | null;
};

type PaymentHealthSummary = {
  expired_count: number;
  expiring_count: number;
  missing_expiry_count: number;
  upcoming_booking_value_cents: number;
  recent_paid_volume_cents: number;
};

type PaymentHealthResponse = {
  summary: PaymentHealthSummary;
  results: PaymentHealthCard[];
};

type NoticeResponse = {
  sent_count: number;
  skipped_count: number;
  failed_count: number;
};

const STATUS_OPTIONS = [
  { value: "at_risk", label: "At risk" },
  { value: "expired", label: "Expired" },
  { value: "expiring", label: "Expiring" },
  { value: "missing_expiry", label: "Missing expiry" },
  { value: "healthy", label: "Healthy" },
  { value: "all", label: "All cards" },
];

const WINDOW_OPTIONS = ["30", "60", "90"];

function moneyFromCents(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function resultMessage(result: NoticeResponse): string {
  const parts = [
    result.sent_count ? `${result.sent_count} sent` : "",
    result.skipped_count ? `${result.skipped_count} skipped` : "",
    result.failed_count ? `${result.failed_count} failed` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(", ") : "No reminders sent";
}

export function OwnerPaymentHealthScreen() {
  const { token } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [status, setStatus] = useState("at_risk");
  const [windowDays, setWindowDays] = useState("30");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<PaymentHealthResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
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

  useEffect(() => {
    if (!token || !orgId) {
      setLocations([]);
      return;
    }
    apiFetch<LocationOption[]>(
      `/api/locations?organization_public_id=${encodeURIComponent(orgId)}`,
      { method: "GET" },
      token,
    )
      .then(setLocations)
      .catch(() => setLocations([]));
  }, [token, orgId]);

  const buildParams = useCallback(() => {
    const params = new URLSearchParams();
    params.set("organization_public_id", orgId);
    params.set("status", status);
    params.set("window_days", windowDays);
    if (locationId) params.set("location_public_id", locationId);
    if (search.trim()) params.set("search", search.trim());
    return params;
  }, [orgId, status, windowDays, locationId, search]);

  const load = useCallback(() => {
    if (!token || !orgId) {
      setHealth(null);
      return;
    }
    setLoading(true);
    apiFetch<PaymentHealthResponse>(
      `/api/owner/payment-health/cards?${buildParams().toString()}`,
      { method: "GET" },
      token,
    )
      .then((result) => {
        setHealth(result);
        setSelected((current) =>
          current.filter((publicId) => result.results.some((row) => row.public_id === publicId)),
        );
      })
      .catch((err) => {
        setHealth(null);
        setMessage(err instanceof Error ? err.message : "Failed to load payment health");
      })
      .finally(() => setLoading(false));
  }, [token, orgId, buildParams]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = health?.results ?? [];

  const summaryCards = useMemo(() => {
    const summary = health?.summary;
    return [
      { label: "Expired", value: String(summary?.expired_count ?? 0) },
      { label: "Expiring", value: String(summary?.expiring_count ?? 0) },
      { label: "Missing expiry", value: String(summary?.missing_expiry_count ?? 0) },
      { label: "Upcoming value", value: moneyFromCents(summary?.upcoming_booking_value_cents ?? 0) },
      { label: "Recent paid volume", value: moneyFromCents(summary?.recent_paid_volume_cents ?? 0) },
    ];
  }, [health]);

  async function sendEmails(publicIds: string[], force = false) {
    if (!token || publicIds.length === 0) return;
    setSending(force && publicIds.length === 1 ? publicIds[0] : "bulk");
    setMessage("");
    try {
      const response = await apiFetch<NoticeResponse>(
        "/api/owner/payment-health/card-notices",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            payment_method_public_ids: publicIds,
            force,
          }),
        },
        token,
      );
      setMessage(resultMessage(response));
      setSelected([]);
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to send reminders");
    } finally {
      setSending(null);
    }
  }

  function toggleSelected(publicId: string) {
    setSelected((current) =>
      current.includes(publicId)
        ? current.filter((item) => item !== publicId)
        : [...current, publicId],
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Payment health</Text>
      <Text style={styles.subtitle}>
        Expired and expiring member cards with upcoming bookings at risk.
      </Text>

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

      <View style={styles.chipRow}>
        {STATUS_OPTIONS.map((option) => (
          <Chip
            key={option.value}
            label={option.label}
            active={status === option.value}
            accessibilityLabel={`Status ${option.label}`}
            onPress={() => setStatus(option.value)}
          />
        ))}
      </View>

      <View style={styles.chipRow}>
        {WINDOW_OPTIONS.map((value) => (
          <Chip
            key={value}
            label={`${value} days`}
            active={windowDays === value}
            accessibilityLabel={`Window ${value} days`}
            onPress={() => setWindowDays(value)}
          />
        ))}
        <Chip
          label="All locations"
          active={!locationId}
          accessibilityLabel="All locations"
          onPress={() => setLocationId("")}
        />
        {locations.map((location) => (
          <Chip
            key={location.public_id}
            label={location.name}
            active={locationId === location.public_id}
            accessibilityLabel={`Location ${location.name}`}
            onPress={() => setLocationId(location.public_id)}
          />
        ))}
      </View>

      <TextInput
        accessibilityLabel="Search cards"
        style={styles.input}
        placeholder="Search by member name or email"
        placeholderTextColor="#9CA3AF"
        value={search}
        onChangeText={setSearch}
        autoCapitalize="none"
      />

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <View style={styles.statsRow}>
        {summaryCards.map((stat) => (
          <View key={stat.label} style={styles.statCard}>
            <Text style={styles.mutedText}>{stat.label}</Text>
            <Text style={styles.statValue}>{stat.value}</Text>
          </View>
        ))}
      </View>

      {selected.length > 0 ? (
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => sendEmails(selected)}
          disabled={sending !== null}
          accessibilityRole="button"
          accessibilityLabel="Send reminders to selected"
        >
          {sending === "bulk" ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryButtonText}>Send reminders ({selected.length})</Text>
          )}
        </TouchableOpacity>
      ) : null}

      <View style={styles.list}>
        {rows.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No cards match these filters.</Text>
        ) : (
          rows.map((row) => {
            const isSelected = selected.includes(row.public_id);
            return (
              <View key={row.public_id} style={styles.card}>
                <Text style={styles.cardTitle}>{row.member_name || row.member_email || "Member"}</Text>
                {row.member_email ? <Text style={styles.mutedText}>{row.member_email}</Text> : null}
                <Text style={styles.cardSubtitle}>
                  {[row.card_brand, row.card_last4 ? `•••• ${row.card_last4}` : null]
                    .filter(Boolean)
                    .join(" ") || row.provider}
                  {row.expiry_label ? ` • ${row.expiry_label}` : ""}
                </Text>
                <Text style={row.card_status === "healthy" ? styles.healthyText : styles.riskText}>
                  {row.card_status.replace(/_/g, " ")}
                </Text>
                <Text style={styles.mutedText}>
                  {row.open_booking_request_count} open requests • {row.future_booking_count} future
                  bookings • {row.active_subscription_count} subscriptions
                </Text>
                <Text style={styles.mutedText}>
                  Upcoming {moneyFromCents(row.upcoming_booking_value_cents)} • Recent{" "}
                  {moneyFromCents(row.recent_paid_volume_cents)}
                </Text>
                {row.last_notice ? (
                  <Text style={styles.mutedText}>
                    Last notice {row.last_notice.status}
                    {row.last_notice.sent_at
                      ? ` • ${new Date(row.last_notice.sent_at).toLocaleString()}`
                      : ""}
                  </Text>
                ) : null}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[styles.secondaryButton, isSelected && styles.selectedButton]}
                    onPress={() => toggleSelected(row.public_id)}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${row.public_id}`}
                  >
                    <Text style={[styles.secondaryButtonText, isSelected && styles.selectedButtonText]}>
                      {isSelected ? "Selected" : "Select"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.secondaryButton}
                    onPress={() => sendEmails([row.public_id], true)}
                    disabled={sending !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Send reminder ${row.public_id}`}
                  >
                    <Text style={styles.secondaryButtonText}>
                      {sending === row.public_id ? "Sending..." : "Send reminder"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
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
    fontWeight: "700"
  },
  chipTextActive: {
    color: "#3730A3"
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
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  statCard: {
    flexGrow: 1,
    minWidth: 105,
    backgroundColor: "#FFFFFF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 10,
    gap: 4
  },
  statValue: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
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
  list: {
    gap: 12
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 14,
    gap: 4
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  cardSubtitle: {
    fontSize: 13,
    color: "#374151"
  },
  healthyText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#047857",
    textTransform: "capitalize"
  },
  riskText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#B45309",
    textTransform: "capitalize"
  },
  actionsRow: {
    marginTop: 8,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
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
  selectedButton: {
    borderColor: "#4F46E5",
    backgroundColor: "#EEF2FF"
  },
  selectedButtonText: {
    color: "#3730A3"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  message: {
    color: "#DC2626",
    fontSize: 12
  }
});

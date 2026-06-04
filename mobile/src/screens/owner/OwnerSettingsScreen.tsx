import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type PricingRule = { public_id: string };
type PromoCode = {
  public_id: string;
  code?: string;
  description?: string | null;
  discount_type?: string;
  discount_value?: number;
  expires_at?: string | null;
  max_redemptions?: number | null;
  max_redemptions_per_member?: number | null;
  total_redemptions?: number;
  is_active?: boolean;
  total_discount_granted_cents?: number;
  revenue_impacted_cents?: number;
  status?: string | null;
};
type FeatureFlag = { public_id: string };
type CancellationPolicy = { public_id: string };
type BookingSettings = {
  booking_approval_mode: "manual" | "auto";
  membership_lease_approval_mode: "manual" | "auto";
  payment_failure_hold_minutes: number;
  waitlist_enabled: boolean;
  waitlist_conference_room_enabled: boolean;
  waitlist_private_office_enabled: boolean;
  waitlist_shared_desk_enabled: boolean;
  waitlist_suite_enabled: boolean;
  waitlist_virtual_office_enabled: boolean;
};

type WaitlistTypeKey =
  | "waitlist_conference_room_enabled"
  | "waitlist_private_office_enabled"
  | "waitlist_shared_desk_enabled"
  | "waitlist_suite_enabled"
  | "waitlist_virtual_office_enabled";

const WAITLIST_TYPE_OPTIONS: Array<{ key: WaitlistTypeKey; label: string; summary: string }> = [
  { key: "waitlist_conference_room_enabled", label: "Conference room", summary: "Conference rooms" },
  { key: "waitlist_private_office_enabled", label: "Private office", summary: "Private offices" },
  { key: "waitlist_shared_desk_enabled", label: "Shared desk", summary: "Shared desks" },
  { key: "waitlist_suite_enabled", label: "Suite", summary: "Suites" },
  { key: "waitlist_virtual_office_enabled", label: "Virtual office", summary: "Virtual offices" },
];

function waitlistSummary(settings: (Pick<BookingSettings, WaitlistTypeKey> & { waitlist_enabled?: boolean }) | null) {
  if (!settings) return "off";
  const enabled = WAITLIST_TYPE_OPTIONS.filter((option) => settings[option.key]).map((option) => option.summary);
  if (enabled.length > 0) return enabled.join(", ");
  return settings.waitlist_enabled ? "All space types" : "off";
}

function formatCents(cents?: number | null) {
  return `$${((cents || 0) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function OwnerSettingsScreen() {
  const { token } = useAuth();
  const [orgId, setOrgId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const [pricingRules, setPricingRules] = useState<PricingRule[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCode[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [policies, setPolicies] = useState<CancellationPolicy[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [connectStatus, setConnectStatus] = useState("Unknown");

  const [pricingForm, setPricingForm] = useState({ rate_type: "daily", rate_amount: "" });
  const [promoForm, setPromoForm] = useState({
    code: "",
    discount_type: "percent",
    discount_value: "",
    description: "",
    expires_at: "",
    max_redemptions: "",
    max_redemptions_per_member: "",
    is_active: "true"
  });
  const [taxRate, setTaxRate] = useState("");
  const [bookingSettingsForm, setBookingSettingsForm] = useState({
    booking_approval_mode: "manual" as "manual" | "auto",
    membership_lease_approval_mode: "manual" as "manual" | "auto",
    payment_failure_hold_minutes: "30",
    waitlist_conference_room_enabled: false,
    waitlist_private_office_enabled: false,
    waitlist_shared_desk_enabled: false,
    waitlist_suite_enabled: false,
    waitlist_virtual_office_enabled: false
  });
  const [flagForm, setFlagForm] = useState({
    flag_key: "instant_booking_enabled",
    flag_value: "false",
    scope_type: "tenant",
    scope_public_id: ""
  });
  const [policyForm, setPolicyForm] = useState({
    space_type: "conference_room",
    cancel_window_hours: "24",
    refund_percent: "0"
  });

  useEffect(() => {
    if (!token || !orgId) return;
    setLoading(true);
    Promise.all([
      apiFetch<PromoCode[]>(`/api/promo-codes?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => []),
      apiFetch(`/api/tax-config?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => null),
      apiFetch<CancellationPolicy[]>(`/api/cancellation-policies?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => []),
      apiFetch<BookingSettings>(`/api/orgs/${orgId}/booking-settings`, { method: "GET" }, token).catch(() => null),
      apiFetch<{ connected: boolean }>(`/api/stripe/connect/status?organization_public_id=${orgId}`, { method: "GET" }, token).catch(
        () => ({ connected: false })
      )
    ])
      .then(([promo, tax, policy, booking, connect]) => {
        setPromoCodes(promo);
        if (tax && (tax as any).rate_percent != null) {
          setTaxRate(String((tax as any).rate_percent));
        }
        setPolicies(policy);
        if (booking) {
          setBookingSettings(booking);
          setBookingSettingsForm({
            booking_approval_mode: booking.booking_approval_mode,
            membership_lease_approval_mode: booking.membership_lease_approval_mode ?? "manual",
            payment_failure_hold_minutes: String(booking.payment_failure_hold_minutes),
            waitlist_conference_room_enabled: Boolean(booking.waitlist_conference_room_enabled),
            waitlist_private_office_enabled: Boolean(booking.waitlist_private_office_enabled),
            waitlist_shared_desk_enabled: Boolean(booking.waitlist_shared_desk_enabled),
            waitlist_suite_enabled: Boolean(booking.waitlist_suite_enabled),
            waitlist_virtual_office_enabled: Boolean(booking.waitlist_virtual_office_enabled)
          });
        }
        setConnectStatus(connect.connected ? "Connected" : "Not connected");
      })
      .finally(() => setLoading(false));
  }, [token, orgId]);

  useEffect(() => {
    if (!token || !spaceId) return;
    apiFetch<PricingRule[]>(`/api/pricing-rules?space_public_id=${spaceId}`, { method: "GET" }, token)
      .then(setPricingRules)
      .catch(() => null);
  }, [token, spaceId]);

  useEffect(() => {
    if (!token || !flagForm.scope_public_id) return;
    apiFetch<FeatureFlag[]>(
      `/api/feature-flags?scope_type=${flagForm.scope_type}&scope_public_id=${flagForm.scope_public_id}`,
      { method: "GET" },
      token
    )
      .then(setFeatureFlags)
      .catch(() => null);
  }, [token, flagForm.scope_public_id, flagForm.scope_type]);

  async function addPricingRule() {
    if (!token || !spaceId) {
      setMessage("Enter space id");
      return;
    }
    await apiFetch(
      "/api/pricing-rules",
      {
        method: "POST",
        body: JSON.stringify({
          space_public_id: spaceId,
          rate_type: pricingForm.rate_type,
          rate_amount: Number(pricingForm.rate_amount)
        })
      },
      token
    );
    setMessage("Pricing rule created");
  }

  async function addPromoCode() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    await apiFetch(
      `/api/promo-codes?organization_public_id=${orgId}`,
      {
        method: "POST",
        body: JSON.stringify({
          code: promoForm.code,
          discount_type: promoForm.discount_type,
          discount_value: Number(promoForm.discount_value),
          description: promoForm.description || null,
          expires_at: promoForm.expires_at ? new Date(promoForm.expires_at).toISOString() : null,
          max_redemptions: promoForm.max_redemptions ? Number(promoForm.max_redemptions) : null,
          max_redemptions_per_member: promoForm.max_redemptions_per_member
            ? Number(promoForm.max_redemptions_per_member)
            : null,
          is_active: promoForm.is_active === "true"
        })
      },
      token
    );
    setMessage("Promo code created");
    setPromoForm({
      code: "",
      discount_type: "percent",
      discount_value: "",
      description: "",
      expires_at: "",
      max_redemptions: "",
      max_redemptions_per_member: "",
      is_active: "true"
    });
  }

  async function saveTaxConfig() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    await apiFetch(
      `/api/tax-config?organization_public_id=${orgId}`,
      { method: "POST", body: JSON.stringify({ rate_percent: Number(taxRate) }) },
      token
    );
    setMessage("Tax config saved");
  }

  async function saveBookingSettings() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    const saved = await apiFetch<BookingSettings>(
      `/api/orgs/${orgId}/booking-settings`,
      {
        method: "PATCH",
        body: JSON.stringify({
          booking_approval_mode: bookingSettingsForm.booking_approval_mode,
          membership_lease_approval_mode: bookingSettingsForm.membership_lease_approval_mode,
          payment_failure_hold_minutes: Number(bookingSettingsForm.payment_failure_hold_minutes),
          waitlist_conference_room_enabled: bookingSettingsForm.waitlist_conference_room_enabled,
          waitlist_private_office_enabled: bookingSettingsForm.waitlist_private_office_enabled,
          waitlist_shared_desk_enabled: bookingSettingsForm.waitlist_shared_desk_enabled,
          waitlist_suite_enabled: bookingSettingsForm.waitlist_suite_enabled,
          waitlist_virtual_office_enabled: bookingSettingsForm.waitlist_virtual_office_enabled
        })
      },
      token
    );
    setBookingSettings(saved);
    setBookingSettingsForm({
      booking_approval_mode: saved.booking_approval_mode,
      membership_lease_approval_mode: saved.membership_lease_approval_mode ?? "manual",
      payment_failure_hold_minutes: String(saved.payment_failure_hold_minutes),
      waitlist_conference_room_enabled: Boolean(saved.waitlist_conference_room_enabled),
      waitlist_private_office_enabled: Boolean(saved.waitlist_private_office_enabled),
      waitlist_shared_desk_enabled: Boolean(saved.waitlist_shared_desk_enabled),
      waitlist_suite_enabled: Boolean(saved.waitlist_suite_enabled),
      waitlist_virtual_office_enabled: Boolean(saved.waitlist_virtual_office_enabled)
    });
    setMessage("Booking approval saved");
  }

  async function saveFeatureFlag() {
    if (!token) return;
    if (!flagForm.scope_public_id) {
      setMessage("Enter scope public id");
      return;
    }
    await apiFetch(
      "/api/feature-flags",
      {
        method: "POST",
        body: JSON.stringify({
          flag_key: flagForm.flag_key,
          flag_value: flagForm.flag_value === "true",
          scope_type: flagForm.scope_type,
          scope_public_id: flagForm.scope_public_id
        })
      },
      token
    );
    setMessage("Feature flag saved");
  }

  async function addPolicy() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    await apiFetch(
      `/api/cancellation-policies?organization_public_id=${orgId}`,
      {
        method: "POST",
        body: JSON.stringify({
          space_type: policyForm.space_type,
          cancel_window_hours: Number(policyForm.cancel_window_hours),
          refund_percent: Number(policyForm.refund_percent)
        })
      },
      token
    );
    setMessage("Cancellation policy saved");
  }

  async function startConnect() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    const res = await apiFetch<{ url: string }>(
      `/api/stripe/connect/onboard?organization_public_id=${orgId}`,
      { method: "POST" },
      token
    );
    setMessage("Opening Stripe onboarding...");
    await Linking.openURL(res.url);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.subtitle}>Pricing, promos, tax, flags, cancellation, payouts.</Text>
      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}

      <TextInput style={styles.input} placeholder="Organization public id" value={orgId} onChangeText={setOrgId} />
      <TextInput style={styles.input} placeholder="Space public id" value={spaceId} onChangeText={setSpaceId} />

      <Text style={styles.sectionTitle}>Pricing rules ({pricingRules.length})</Text>
      <View style={styles.optionRow}>
        {["hourly", "daily"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, pricingForm.rate_type === opt && styles.optionActive]}
            onPress={() => setPricingForm({ ...pricingForm, rate_type: opt })}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Rate amount"
        value={pricingForm.rate_amount}
        onChangeText={(value) => setPricingForm({ ...pricingForm, rate_amount: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={addPricingRule}>
        <Text style={styles.primaryButtonText}>Add pricing rule</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Promo codes ({promoCodes.length})</Text>
      <View style={styles.optionRow}>
        {["percent", "fixed"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, promoForm.discount_type === opt && styles.optionActive]}
            onPress={() => setPromoForm({ ...promoForm, discount_type: opt })}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Code"
        value={promoForm.code}
        onChangeText={(value) => setPromoForm({ ...promoForm, code: value.toUpperCase() })}
      />
      <TextInput
        style={styles.input}
        placeholder={promoForm.discount_type === "fixed" ? "Fixed amount ($)" : "Percent"}
        value={promoForm.discount_value}
        onChangeText={(value) => setPromoForm({ ...promoForm, discount_value: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Description"
        value={promoForm.description}
        onChangeText={(value) => setPromoForm({ ...promoForm, description: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Expiration date YYYY-MM-DD"
        value={promoForm.expires_at}
        onChangeText={(value) => setPromoForm({ ...promoForm, expires_at: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Max redemptions"
        value={promoForm.max_redemptions}
        keyboardType="number-pad"
        onChangeText={(value) => setPromoForm({ ...promoForm, max_redemptions: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Max per member"
        value={promoForm.max_redemptions_per_member}
        keyboardType="number-pad"
        onChangeText={(value) => setPromoForm({ ...promoForm, max_redemptions_per_member: value })}
      />
      <View style={styles.optionRow}>
        {[
          { label: "Active", value: "true" },
          { label: "Inactive", value: "false" }
        ].map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionButton, promoForm.is_active === opt.value && styles.optionActive]}
            onPress={() => setPromoForm({ ...promoForm, is_active: opt.value })}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={addPromoCode}>
        <Text style={styles.primaryButtonText}>Add promo code</Text>
      </TouchableOpacity>
      {promoCodes.map((promo) => (
        <View key={promo.public_id} style={styles.infoCard}>
          <Text style={styles.cardTitle}>
            {promo.code} • {promo.discount_type === "fixed" ? `$${promo.discount_value}` : `${promo.discount_value}%`}
          </Text>
          <Text style={styles.cardMuted}>
            {promo.status || (promo.is_active ? "active" : "inactive")} • Used {promo.total_redemptions || 0}
            {promo.max_redemptions ? ` / ${promo.max_redemptions}` : ""}
          </Text>
          <Text style={styles.cardMuted}>
            Per member {promo.max_redemptions_per_member || "unlimited"} • Expires{" "}
            {promo.expires_at ? new Date(promo.expires_at).toLocaleDateString() : "never"}
          </Text>
          <Text style={styles.cardMuted}>
            Discounts {formatCents(promo.total_discount_granted_cents)} • Revenue {formatCents(promo.revenue_impacted_cents)}
          </Text>
        </View>
      ))}

      <Text style={styles.sectionTitle}>Tax rate</Text>
      <TextInput style={styles.input} placeholder="Rate %" value={taxRate} onChangeText={setTaxRate} />
      <TouchableOpacity style={styles.primaryButton} onPress={saveTaxConfig}>
        <Text style={styles.primaryButtonText}>Save tax</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Booking approval</Text>
      <Text style={styles.subtitle}>
        Current: hourly/day-pass {bookingSettings?.booking_approval_mode === "auto" ? "auto approve" : "manual approval"} ·{" "}
        membership & lease {bookingSettings?.membership_lease_approval_mode === "auto" ? "auto approve" : "manual approval"} ·{" "}
        {bookingSettings?.payment_failure_hold_minutes === 0
          ? "cancel immediately"
          : `${bookingSettings?.payment_failure_hold_minutes ?? 30} min recovery`}{" "}
        · waitlist: {waitlistSummary(bookingSettings)}
      </Text>
      <Text style={styles.label}>Hourly/day-pass approval</Text>
      <View style={styles.optionRow}>
        {[
          { value: "manual", label: "Manual approval" },
          { value: "auto", label: "Auto approve" }
        ].map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionButton, bookingSettingsForm.booking_approval_mode === opt.value && styles.optionActive]}
            onPress={() => setBookingSettingsForm({ ...bookingSettingsForm, booking_approval_mode: opt.value as "manual" | "auto" })}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Membership & lease approval</Text>
      <View style={styles.optionRow}>
        {[
          { value: "manual", label: "Manual approval" },
          { value: "auto", label: "Auto approve" }
        ].map((opt) => (
          <TouchableOpacity
            key={`membership-${opt.value}`}
            style={[styles.optionButton, bookingSettingsForm.membership_lease_approval_mode === opt.value && styles.optionActive]}
            onPress={() => setBookingSettingsForm({ ...bookingSettingsForm, membership_lease_approval_mode: opt.value as "manual" | "auto" })}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Payment failure recovery</Text>
      <View style={styles.optionRow}>
        {[
          { value: "0", label: "Cancel immediately" },
          { value: "15", label: "15 min" },
          { value: "30", label: "30 min" },
          { value: "60", label: "60 min" }
        ].map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionButton, bookingSettingsForm.payment_failure_hold_minutes === opt.value && styles.optionActive]}
            onPress={() => setBookingSettingsForm({ ...bookingSettingsForm, payment_failure_hold_minutes: opt.value })}
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Waitlist by space type</Text>
      <View style={styles.optionRow}>
        {WAITLIST_TYPE_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.optionButton, bookingSettingsForm[opt.key] && styles.optionActive]}
            onPress={() =>
              setBookingSettingsForm((current) => ({
                ...current,
                [opt.key]: !current[opt.key]
              }))
            }
          >
            <Text style={styles.optionText}>{opt.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.primaryButton} onPress={saveBookingSettings}>
        <Text style={styles.primaryButtonText}>Save booking approval</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Feature flags ({featureFlags.length})</Text>
      <View style={styles.optionRow}>
        {["tenant", "space"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, flagForm.scope_type === opt && styles.optionActive]}
            onPress={() => setFlagForm({ ...flagForm, scope_type: opt })}
          >
            <Text style={styles.optionText}>{opt}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.optionRow}>
        {["true", "false"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, flagForm.flag_value === opt && styles.optionActive]}
            onPress={() => setFlagForm({ ...flagForm, flag_value: opt })}
          >
            <Text style={styles.optionText}>{opt === "true" ? "enabled" : "disabled"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Scope public id"
        value={flagForm.scope_public_id}
        onChangeText={(value) => setFlagForm({ ...flagForm, scope_public_id: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={saveFeatureFlag}>
        <Text style={styles.primaryButtonText}>Save flag</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Cancellation policies ({policies.length})</Text>
      <View style={styles.optionRow}>
        {["conference_room", "private_office", "shared_desk", "virtual_office"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, policyForm.space_type === opt && styles.optionActive]}
            onPress={() => setPolicyForm({ ...policyForm, space_type: opt })}
          >
            <Text style={styles.optionText}>{opt.replace("_", " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Cancel window hours"
        value={policyForm.cancel_window_hours}
        onChangeText={(value) => setPolicyForm({ ...policyForm, cancel_window_hours: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Refund %"
        value={policyForm.refund_percent}
        onChangeText={(value) => setPolicyForm({ ...policyForm, refund_percent: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={addPolicy}>
        <Text style={styles.primaryButtonText}>Add policy</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Stripe Connect</Text>
      <Text style={styles.subtitle}>Status: {connectStatus}</Text>
      <TouchableOpacity style={styles.primaryButton} onPress={startConnect}>
        <Text style={styles.primaryButtonText}>Start onboarding</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    color: "#111827"
  },
  subtitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#6B7280"
  },
  message: {
    marginTop: 12,
    color: "#0F766E",
    fontSize: 12
  },
  input: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF"
  },
  sectionTitle: {
    marginTop: 18,
    fontSize: 14,
    fontWeight: "600",
    color: "#111827"
  },
  label: {
    marginTop: 12,
    fontSize: 12,
    fontWeight: "600",
    color: "#374151"
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: "#111827",
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600"
  },
  optionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10
  },
  optionButton: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6
  },
  optionActive: {
    borderColor: "#111827",
    backgroundColor: "#F3F4F6"
  },
  optionText: {
    fontSize: 12,
    color: "#111827",
    fontWeight: "600"
  },
  infoCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF"
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#111827"
  },
  cardMuted: {
    marginTop: 4,
    fontSize: 12,
    color: "#6B7280"
  }
});

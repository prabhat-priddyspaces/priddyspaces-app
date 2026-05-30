import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";

import { apiFetch } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";

type PricingRule = { public_id: string };
type PromoCode = { public_id: string };
type FeatureFlag = { public_id: string };
type CancellationPolicy = { public_id: string };
type SubscriptionPlan = { public_id: string };
type BookingSettings = {
  booking_approval_mode: "manual" | "auto";
  payment_failure_hold_minutes: number;
};

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
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [bookingSettings, setBookingSettings] = useState<BookingSettings | null>(null);
  const [connectStatus, setConnectStatus] = useState("Unknown");

  const [pricingForm, setPricingForm] = useState({ rate_type: "daily", rate_amount: "" });
  const [promoForm, setPromoForm] = useState({ code: "", discount_type: "percent", discount_value: "" });
  const [taxRate, setTaxRate] = useState("");
  const [bookingSettingsForm, setBookingSettingsForm] = useState({
    booking_approval_mode: "manual" as "manual" | "auto",
    payment_failure_hold_minutes: "30"
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
  const [planForm, setPlanForm] = useState({
    name: "",
    space_type: "shared_desk",
    billing_cycle: "monthly",
    price: "",
    stripe_price_id: "",
    is_active: "true"
  });

  useEffect(() => {
    if (!token || !orgId) return;
    setLoading(true);
    Promise.all([
      apiFetch<PromoCode[]>(`/api/promo-codes?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => []),
      apiFetch(`/api/tax-config?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => null),
      apiFetch<CancellationPolicy[]>(`/api/cancellation-policies?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => []),
      apiFetch<SubscriptionPlan[]>(`/api/subscription-plans?organization_public_id=${orgId}`, { method: "GET" }, token).catch(() => []),
      apiFetch<BookingSettings>(`/api/orgs/${orgId}/booking-settings`, { method: "GET" }, token).catch(() => null),
      apiFetch<{ connected: boolean }>(`/api/stripe/connect/status?organization_public_id=${orgId}`, { method: "GET" }, token).catch(
        () => ({ connected: false })
      )
    ])
      .then(([promo, tax, policy, plan, booking, connect]) => {
        setPromoCodes(promo);
        if (tax && (tax as any).rate_percent != null) {
          setTaxRate(String((tax as any).rate_percent));
        }
        setPolicies(policy);
        setPlans(plan);
        if (booking) {
          setBookingSettings(booking);
          setBookingSettingsForm({
            booking_approval_mode: booking.booking_approval_mode,
            payment_failure_hold_minutes: String(booking.payment_failure_hold_minutes)
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
          is_active: true
        })
      },
      token
    );
    setMessage("Promo code created");
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
          payment_failure_hold_minutes: Number(bookingSettingsForm.payment_failure_hold_minutes)
        })
      },
      token
    );
    setBookingSettings(saved);
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

  async function addPlan() {
    if (!token || !orgId) {
      setMessage("Enter organization id");
      return;
    }
    await apiFetch(
      `/api/subscription-plans?organization_public_id=${orgId}`,
      {
        method: "POST",
        body: JSON.stringify({
          name: planForm.name,
          space_type: planForm.space_type,
          billing_cycle: planForm.billing_cycle,
          price: Number(planForm.price),
          stripe_price_id: planForm.stripe_price_id || null,
          is_active: planForm.is_active === "true"
        })
      },
      token
    );
    setMessage("Membership plan saved");
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
        onChangeText={(value) => setPromoForm({ ...promoForm, code: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Discount value"
        value={promoForm.discount_value}
        onChangeText={(value) => setPromoForm({ ...promoForm, discount_value: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={addPromoCode}>
        <Text style={styles.primaryButtonText}>Add promo code</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Tax rate</Text>
      <TextInput style={styles.input} placeholder="Rate %" value={taxRate} onChangeText={setTaxRate} />
      <TouchableOpacity style={styles.primaryButton} onPress={saveTaxConfig}>
        <Text style={styles.primaryButtonText}>Save tax</Text>
      </TouchableOpacity>

      <Text style={styles.sectionTitle}>Booking approval</Text>
      <Text style={styles.subtitle}>
        Current: {bookingSettings?.booking_approval_mode === "auto" ? "Auto approve" : "Manual approval"} ·{" "}
        {bookingSettings?.payment_failure_hold_minutes === 0
          ? "cancel immediately"
          : `${bookingSettings?.payment_failure_hold_minutes ?? 30} min recovery`}
      </Text>
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

      <Text style={styles.sectionTitle}>Membership plans ({plans.length})</Text>
      <View style={styles.optionRow}>
        {["shared_desk", "conference_room", "private_office", "virtual_office"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, planForm.space_type === opt && styles.optionActive]}
            onPress={() => setPlanForm({ ...planForm, space_type: opt })}
          >
            <Text style={styles.optionText}>{opt.replace("_", " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.optionRow}>
        {["monthly", "quarterly", "six_month", "yearly"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, planForm.billing_cycle === opt && styles.optionActive]}
            onPress={() => setPlanForm({ ...planForm, billing_cycle: opt })}
          >
            <Text style={styles.optionText}>{opt.replace("_", " ")}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.optionRow}>
        {["true", "false"].map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.optionButton, planForm.is_active === opt && styles.optionActive]}
            onPress={() => setPlanForm({ ...planForm, is_active: opt })}
          >
            <Text style={styles.optionText}>{opt === "true" ? "active" : "inactive"}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="Plan name"
        value={planForm.name}
        onChangeText={(value) => setPlanForm({ ...planForm, name: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Price"
        value={planForm.price}
        onChangeText={(value) => setPlanForm({ ...planForm, price: value })}
      />
      <TextInput
        style={styles.input}
        placeholder="Stripe price id"
        value={planForm.stripe_price_id}
        onChangeText={(value) => setPlanForm({ ...planForm, stripe_price_id: value })}
      />
      <TouchableOpacity style={styles.primaryButton} onPress={addPlan}>
        <Text style={styles.primaryButtonText}>Add plan</Text>
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
  }
});

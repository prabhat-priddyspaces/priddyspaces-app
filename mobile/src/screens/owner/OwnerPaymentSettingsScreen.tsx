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

type OwnerPaymentSetting = {
  public_id: string;
  provider: "stripe" | "cardpointe";
  is_enabled: boolean;
  is_test_mode: boolean;
  stripe_publishable_key: string | null;
  has_stripe_secret_key: boolean;
  has_stripe_webhook_secret: boolean;
  cardpointe_merchant_id: string | null;
  has_cardpointe_username: boolean;
  has_cardpointe_password: boolean;
  cardpointe_site: string | null;
  cardpointe_tokenizer_url: string | null;
  connection_status: string;
  last_tested_at: string | null;
};

type MarketplaceReadiness = {
  organization_public_id: string;
  status: string;
  blockers: string[];
  public_listing_count: number;
  marketplace_visible_listing_count: number;
  payment_hidden_listing_count: number;
};

const emptyForm = {
  provider: "stripe" as "stripe" | "cardpointe",
  is_enabled: false,
  is_test_mode: true,
  stripe_publishable_key: "",
  stripe_secret_key: "",
  stripe_webhook_secret: "",
  cardpointe_merchant_id: "",
  cardpointe_username: "",
  cardpointe_password: "",
  cardpointe_site: "",
  cardpointe_tokenizer_url: "",
};

const PROVIDER_CHOICES: { value: "" | "stripe" | "cardpointe"; label: string }[] = [
  { value: "", label: "Default" },
  { value: "stripe", label: "Stripe" },
  { value: "cardpointe", label: "CardPointe" },
];

const SUCCESS_MESSAGES = new Set([
  "Payment settings saved",
  "Connection test succeeded",
  "Provider enabled",
  "Provider disabled",
  "Organization payment provider saved",
  "Location payment provider saved",
]);

export function OwnerPaymentSettingsScreen() {
  const { token } = useAuth();
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState("");
  const [settings, setSettings] = useState<OwnerPaymentSetting[]>([]);
  const [readiness, setReadiness] = useState<MarketplaceReadiness[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [orgOverride, setOrgOverride] = useState<"" | "stripe" | "cardpointe">("");
  const [locationOverride, setLocationOverride] = useState<"" | "stripe" | "cardpointe">("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const selected = useMemo(
    () => settings.find((setting) => setting.provider === form.provider) || null,
    [settings, form.provider],
  );
  const selectedReadiness = useMemo(
    () => readiness.find((item) => item.organization_public_id === orgId) || null,
    [orgId, readiness],
  );

  const loadOrgData = useCallback(
    async (targetOrgId: string) => {
      if (!token || !targetOrgId) return;
      const [settingsList, readinessList, locationList] = await Promise.all([
        apiFetch<OwnerPaymentSetting[]>(
          `/api/owner/payment-settings?organization_public_id=${encodeURIComponent(targetOrgId)}`,
          { method: "GET" },
          token,
        ),
        apiFetch<MarketplaceReadiness[]>("/api/owner/marketplace-readiness", { method: "GET" }, token).catch(
          () => [],
        ),
        apiFetch<LocationOption[]>(
          `/api/locations?organization_public_id=${encodeURIComponent(targetOrgId)}`,
          { method: "GET" },
          token,
        ).catch(() => []),
      ]);
      setSettings(settingsList);
      setReadiness(Array.isArray(readinessList) ? readinessList : []);
      setLocations(locationList);
      setLocationId((current) => current || locationList[0]?.public_id || "");
    },
    [token],
  );

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setMessage("");
    apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token)
      .then(async (list) => {
        setOrgs(list);
        if (list.length > 0) {
          setOrgId(list[0].public_id);
          await loadOrgData(list[0].public_id);
        }
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load payment settings"))
      .finally(() => setLoading(false));
  }, [token, loadOrgData]);

  useEffect(() => {
    if (!selected) {
      setForm((current) => ({ ...emptyForm, provider: current.provider }));
      return;
    }
    setForm((current) => ({
      ...current,
      is_enabled: selected.is_enabled,
      is_test_mode: selected.is_test_mode,
      stripe_publishable_key: selected.stripe_publishable_key || "",
      stripe_secret_key: "",
      stripe_webhook_secret: "",
      cardpointe_merchant_id: selected.cardpointe_merchant_id || "",
      cardpointe_username: "",
      cardpointe_password: "",
      cardpointe_site: selected.cardpointe_site || "",
      cardpointe_tokenizer_url: selected.cardpointe_tokenizer_url || "",
    }));
  }, [selected]);

  async function selectOrg(nextOrgId: string) {
    setOrgId(nextOrgId);
    setLocationId("");
    try {
      await loadOrgData(nextOrgId);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load payment settings");
    }
  }

  async function saveSettings() {
    if (!token || !orgId) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/owner/payment-settings?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "POST", body: JSON.stringify(form) },
        token,
      );
      setMessage("Payment settings saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save payment settings");
    } finally {
      await loadOrgData(orgId).catch(() => undefined);
    }
  }

  async function testSetting(publicId: string) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(`/api/owner/payment-settings/${publicId}/test`, { method: "POST" }, token);
      setMessage("Connection test succeeded");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Connection test failed");
    } finally {
      await loadOrgData(orgId).catch(() => undefined);
    }
  }

  async function toggleSetting(publicId: string, enabled: boolean) {
    if (!token) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/owner/payment-settings/${publicId}/${enabled ? "enable" : "disable"}`,
        { method: "POST" },
        token,
      );
      setMessage(enabled ? "Provider enabled" : "Provider disabled");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to update provider status");
    } finally {
      await loadOrgData(orgId).catch(() => undefined);
    }
  }

  async function saveOrgOverride() {
    if (!token || !orgId) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/owner/payment-provider/organization/${orgId}`,
        { method: "PATCH", body: JSON.stringify({ payment_provider: orgOverride || null }) },
        token,
      );
      setMessage("Organization payment provider saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save organization provider");
    }
  }

  async function saveLocationOverride() {
    if (!token || !locationId) return;
    setMessage("");
    try {
      await apiFetch(
        `/api/owner/payment-provider/location/${locationId}`,
        { method: "PATCH", body: JSON.stringify({ payment_provider: locationOverride || null }) },
        token,
      );
      setMessage("Location payment provider saved");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save location provider");
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <Text style={styles.title}>Payment settings</Text>
      <Text style={styles.subtitle}>Configure the provider used for booking request charges.</Text>

      {loading ? <ActivityIndicator style={{ marginTop: 12 }} /> : null}
      {message ? (
        <Text style={SUCCESS_MESSAGES.has(message) ? styles.successMessage : styles.message}>{message}</Text>
      ) : null}

      {selectedReadiness ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Marketplace payment status</Text>
          <Text style={styles.bodyText}>
            {selectedReadiness.status === "ready"
              ? "Payments are ready. Public listings can appear in marketplace search."
              : selectedReadiness.status === "no_public_listings"
                ? "No public active listings need payment setup yet."
                : "Payment setup required. Your listings are hidden from search until payments are configured."}
          </Text>
          <Text style={styles.mutedText}>
            Visible listings {selectedReadiness.marketplace_visible_listing_count} • Hidden listings{" "}
            {selectedReadiness.payment_hidden_listing_count} • Public listings{" "}
            {selectedReadiness.public_listing_count}
          </Text>
          {selectedReadiness.blockers.map((blocker) => (
            <Text key={blocker} style={styles.blockerText}>
              {blocker}
            </Text>
          ))}
        </View>
      ) : null}

      {orgs.length > 1 ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Organization</Text>
          <View style={styles.chipRow}>
            {orgs.map((org) => (
              <Chip
                key={org.public_id}
                label={org.name}
                active={orgId === org.public_id}
                accessibilityLabel={`Organization ${org.name}`}
                onPress={() => void selectOrg(org.public_id)}
              />
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Organization provider override</Text>
        <View style={styles.chipRow}>
          {PROVIDER_CHOICES.map((choice) => (
            <Chip
              key={choice.value || "default"}
              label={choice.value ? choice.label : "Global default"}
              active={orgOverride === choice.value}
              accessibilityLabel={`Organization provider ${choice.value ? choice.label : "Global default"}`}
              onPress={() => setOrgOverride(choice.value)}
            />
          ))}
        </View>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={saveOrgOverride}
          disabled={!orgId}
          accessibilityRole="button"
          accessibilityLabel="Save organization override"
        >
          <Text style={styles.secondaryButtonText}>Save organization override</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Location provider override</Text>
        <View style={styles.chipRow}>
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
        <View style={styles.chipRow}>
          {PROVIDER_CHOICES.map((choice) => (
            <Chip
              key={choice.value || "default"}
              label={choice.value ? choice.label : "Org/global default"}
              active={locationOverride === choice.value}
              accessibilityLabel={`Location provider ${choice.value ? choice.label : "Org/global default"}`}
              onPress={() => setLocationOverride(choice.value)}
            />
          ))}
        </View>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={saveLocationOverride}
          disabled={!locationId}
          accessibilityRole="button"
          accessibilityLabel="Save location override"
        >
          <Text style={styles.secondaryButtonText}>Save location override</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Provider credentials</Text>
        <View style={styles.chipRow}>
          <Chip
            label="Stripe"
            active={form.provider === "stripe"}
            accessibilityLabel="Provider Stripe"
            onPress={() => setForm((current) => ({ ...current, provider: "stripe" }))}
          />
          <Chip
            label="CardPointe"
            active={form.provider === "cardpointe"}
            accessibilityLabel="Provider CardPointe"
            onPress={() => setForm((current) => ({ ...current, provider: "cardpointe" }))}
          />
        </View>
        <View style={styles.chipRow}>
          <Chip
            label={form.is_enabled ? "Enabled" : "Disabled"}
            active={form.is_enabled}
            accessibilityLabel="Toggle enabled"
            onPress={() => setForm((current) => ({ ...current, is_enabled: !current.is_enabled }))}
          />
          <Chip
            label={form.is_test_mode ? "Test mode" : "Live mode"}
            active={form.is_test_mode}
            accessibilityLabel="Toggle test mode"
            onPress={() => setForm((current) => ({ ...current, is_test_mode: !current.is_test_mode }))}
          />
        </View>

        {form.provider === "stripe" ? (
          <View style={styles.fieldGroup}>
            <Field
              label="Stripe publishable key"
              value={form.stripe_publishable_key}
              onChange={(stripe_publishable_key) => setForm((c) => ({ ...c, stripe_publishable_key }))}
            />
            <Field
              label="Stripe secret key"
              value={form.stripe_secret_key}
              onChange={(stripe_secret_key) => setForm((c) => ({ ...c, stripe_secret_key }))}
              placeholder={selected?.has_stripe_secret_key ? "Secret key saved" : undefined}
              secure
            />
            <Field
              label="Stripe webhook secret"
              value={form.stripe_webhook_secret}
              onChange={(stripe_webhook_secret) => setForm((c) => ({ ...c, stripe_webhook_secret }))}
              placeholder={selected?.has_stripe_webhook_secret ? "Webhook secret saved" : undefined}
              secure
            />
          </View>
        ) : (
          <View style={styles.fieldGroup}>
            <Field
              label="Merchant ID"
              value={form.cardpointe_merchant_id}
              onChange={(cardpointe_merchant_id) => setForm((c) => ({ ...c, cardpointe_merchant_id }))}
            />
            <Field
              label="Gateway site"
              value={form.cardpointe_site}
              onChange={(cardpointe_site) => setForm((c) => ({ ...c, cardpointe_site }))}
            />
            <Field
              label="Username"
              value={form.cardpointe_username}
              onChange={(cardpointe_username) => setForm((c) => ({ ...c, cardpointe_username }))}
              placeholder={selected?.has_cardpointe_username ? "Username saved" : undefined}
            />
            <Field
              label="Password"
              value={form.cardpointe_password}
              onChange={(cardpointe_password) => setForm((c) => ({ ...c, cardpointe_password }))}
              placeholder={selected?.has_cardpointe_password ? "Password saved" : undefined}
              secure
            />
            <Field
              label="Tokenizer URL"
              value={form.cardpointe_tokenizer_url}
              onChange={(cardpointe_tokenizer_url) => setForm((c) => ({ ...c, cardpointe_tokenizer_url }))}
            />
          </View>
        )}

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={saveSettings}
          disabled={!orgId}
          accessibilityRole="button"
          accessibilityLabel="Save provider"
        >
          <Text style={styles.primaryButtonText}>Save provider</Text>
        </TouchableOpacity>
        {selected ? (
          <View style={styles.chipRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => testSetting(selected.public_id)}
              accessibilityRole="button"
              accessibilityLabel="Test connection"
            >
              <Text style={styles.secondaryButtonText}>Test connection</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={() => toggleSetting(selected.public_id, !selected.is_enabled)}
              accessibilityRole="button"
              accessibilityLabel={selected.is_enabled ? "Disable provider" : "Enable provider"}
            >
              <Text style={styles.secondaryButtonText}>
                {selected.is_enabled ? "Disable provider" : "Enable provider"}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configured providers</Text>
        {settings.length === 0 && !loading ? (
          <Text style={styles.mutedText}>No providers configured.</Text>
        ) : null}
        {settings.map((setting) => (
          <View key={setting.public_id} style={styles.providerCard}>
            <Text style={styles.providerName}>{setting.provider}</Text>
            <Text style={styles.mutedText}>
              {setting.is_enabled ? "Enabled" : "Disabled"} • {setting.is_test_mode ? "Test" : "Live"} •{" "}
              {setting.connection_status}
            </Text>
            {setting.last_tested_at ? (
              <Text style={styles.mutedText}>Last tested {new Date(setting.last_tested_at).toLocaleString()}</Text>
            ) : null}
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

function Field({
  label,
  value,
  onChange,
  placeholder,
  secure,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  secure?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        style={styles.input}
        placeholder={placeholder || label}
        placeholderTextColor="#9CA3AF"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry={secure}
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
    gap: 14
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
    gap: 10
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#111827"
  },
  bodyText: {
    fontSize: 13,
    color: "#374151"
  },
  mutedText: {
    fontSize: 12,
    color: "#6B7280"
  },
  blockerText: {
    fontSize: 12,
    color: "#B45309"
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
    paddingVertical: 8,
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
  fieldGroup: {
    gap: 10
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
    paddingVertical: 13,
    backgroundColor: "#4F46E5"
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
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
  providerCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 12,
    gap: 4
  },
  providerName: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    textTransform: "capitalize"
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

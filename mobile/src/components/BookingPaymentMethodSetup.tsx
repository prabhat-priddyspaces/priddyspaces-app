import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CardField, useStripe } from "@stripe/stripe-react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";

import { apiFetch } from "../lib/api";

type SetupSession = {
  provider: "stripe" | "cardpointe";
  owner_payment_setting_public_id: string;
  provider_customer_id: string | null;
  client_secret: string | null;
  setup_intent_id: string | null;
  publishable_key: string | null;
  tokenizer_url: string | null;
};

type SavedMethod = {
  public_id: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default_for_owner: boolean;
};

type SaveResponse = {
  public_id: string;
};

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") return String(value);
  }
  return null;
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeLast4(value: string | null | undefined): string | null {
  const text = value?.trim() || "";
  return /^\d{4}$/.test(text) ? text : null;
}

function last4FromToken(value: string | null | undefined): string | null {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

function normalizeExpiration(value: string | null | undefined): string | null {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 4 || digits.length === 6) {
    const month = Number(digits.slice(0, 2));
    if (month >= 1 && month <= 12) return digits;
  }
  return null;
}

function expirationParts(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 4) return { expiration: digits, label: `${digits.slice(0, 2)}/20${digits.slice(2)}` };
  return { expiration: digits, label: `${digits.slice(0, 2)}/${digits.slice(2)}` };
}

function cardLabel(method: SavedMethod) {
  const brand = method.brand || "Card";
  const last4 = method.last4 ? ` ending in ${method.last4}` : "";
  const expiry =
    method.exp_month != null && method.exp_year != null
      ? ` · Expires ${String(method.exp_month).padStart(2, "0")}/${method.exp_year}`
      : "";
  return `${brand}${last4}${expiry}`;
}

export function BookingPaymentMethodSetup({
  token,
  spacePublicId,
  organizationName,
  onSaved,
}: {
  token: string;
  spacePublicId: string;
  organizationName?: string | null;
  onSaved: (publicId: string) => void;
}) {
  const [session, setSession] = useState<SetupSession | null>(null);
  const [savedMethods, setSavedMethods] = useState<SavedMethod[]>([]);
  const [showSaved, setShowSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [billingName, setBillingName] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [consent, setConsent] = useState(false);
  const [cardComplete, setCardComplete] = useState(false);
  const [cardToken, setCardToken] = useState("");
  const [last4, setLast4] = useState("");
  const [expiration, setExpiration] = useState("");
  const stripe = useStripe();
  const ownerName = organizationName?.trim() || "this organization";

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      apiFetch<SetupSession>(
        "/api/payment-methods/setup-session",
        {
          method: "POST",
          body: JSON.stringify({ space_public_id: spacePublicId }),
        },
        token,
      ),
      apiFetch<SavedMethod[]>(
        `/api/payment-methods?space_public_id=${encodeURIComponent(spacePublicId)}`,
        { method: "GET" },
        token,
      ).catch(() => []),
    ])
      .then(([setup, methods]) => {
        if (!active) return;
        setSession(setup);
        setSavedMethods(methods);
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Unable to start payment setup");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [spacePublicId, token]);

  function handleTokenizerMessage(event: WebViewMessageEvent) {
    const raw = event.nativeEvent.data;
    const data = typeof raw === "string" ? safeJson(raw) : raw;
    const nextToken =
      typeof raw === "string" && !data
        ? raw
        : firstString(data?.token, data?.card_token, data?.account, data?.message);
    if (nextToken) setCardToken(nextToken);
    const nextLast4 = normalizeLast4(firstString(data?.last4, data?.last_four, data?.lastFour)) || last4FromToken(nextToken);
    if (nextLast4) setLast4(nextLast4);
    const nextExpiration = normalizeExpiration(
      firstString(data?.expiration, data?.expiry, data?.exp, data?.expiry_date, data?.expiryDate),
    );
    if (nextExpiration) setExpiration(nextExpiration);
  }

  async function saveStripeCard() {
    if (!session?.client_secret) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await stripe.confirmSetupIntent(session.client_secret, {
        paymentMethodType: "Card",
        paymentMethodData: {
          billingDetails: {
            name: billingName || undefined,
            address: billingZip ? { postalCode: billingZip } : undefined,
          },
        },
      });
      if (result.error) throw new Error(result.error.message);
      const setupIntent: any = result.setupIntent;
      const saved = await apiFetch<SaveResponse>(
        "/api/payment-methods",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spacePublicId,
            owner_payment_setting_public_id: session.owner_payment_setting_public_id,
            provider_customer_id: session.provider_customer_id,
            setup_intent_id: setupIntent?.id || session.setup_intent_id,
            provider_payment_method_id: setupIntent?.paymentMethodId || setupIntent?.paymentMethod,
            billing_name: billingName || null,
            billing_zip: billingZip || null,
          }),
        },
        token,
      );
      onSaved(saved.public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save card");
    } finally {
      setSaving(false);
    }
  }

  async function saveCardPointeCard() {
    const normalizedLast4 = normalizeLast4(last4) || last4FromToken(cardToken);
    const normalizedExpiration = normalizeExpiration(expiration);
    if (!session || !cardToken || !normalizedLast4 || !normalizedExpiration) {
      setMessage("Card details are incomplete. Please re-enter the card details.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const saved = await apiFetch<SaveResponse>(
        "/api/payment-methods",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spacePublicId,
            owner_payment_setting_public_id: session.owner_payment_setting_public_id,
            card_token: cardToken,
            last4: normalizedLast4,
            expiration: normalizedExpiration,
            brand: "card",
            billing_name: billingName || null,
            billing_zip: billingZip || null,
          }),
        },
        token,
      );
      onSaved(saved.public_id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to save card");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <ActivityIndicator style={{ marginTop: 12 }} accessibilityLabel="Loading booking payment cards" />;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Booking card</Text>
      <TouchableOpacity style={styles.consentRow} onPress={() => setConsent((current) => !current)}>
        <View style={[styles.checkbox, consent && styles.checkboxActive]} />
        <Text style={styles.consentText}>I authorize {ownerName} to charge this card for booking payments.</Text>
      </TouchableOpacity>
      {savedMethods.length > 0 ? (
        <TouchableOpacity style={styles.secondaryButton} onPress={() => setShowSaved((current) => !current)}>
          <Text style={styles.secondaryButtonText}>{showSaved ? "Add a new card" : "Use a saved card"}</Text>
        </TouchableOpacity>
      ) : null}
      {showSaved ? (
        <View style={styles.savedList}>
          {savedMethods.map((method) => (
            <TouchableOpacity
              key={method.public_id}
              style={styles.savedCard}
              onPress={() => {
                if (!consent) {
                  setMessage("Authorize the booking charge before continuing.");
                  return;
                }
                onSaved(method.public_id);
              }}
            >
              <Text style={styles.savedCardText}>
                {cardLabel(method)}
                {method.is_default_for_owner ? " · Default" : ""}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
      {!showSaved && session?.provider === "stripe" ? (
        <>
          <CardField
            postalCodeEnabled
            placeholders={{ number: "4242 4242 4242 4242" }}
            cardStyle={{
              backgroundColor: "#FFFFFF",
              textColor: "#111827",
              borderColor: "#E5E7EB",
              borderWidth: 1,
              borderRadius: 10,
            }}
            style={styles.cardFieldContainer}
            onCardChange={(details) => setCardComplete(Boolean(details.complete))}
          />
          <TextInput style={styles.input} placeholder="Name on card" value={billingName} onChangeText={setBillingName} />
          <TextInput style={styles.input} placeholder="Billing ZIP" value={billingZip} onChangeText={setBillingZip} />
          <TouchableOpacity
            style={[styles.primaryButton, (!consent || !cardComplete || saving) && styles.disabledButton]}
            onPress={saveStripeCard}
            disabled={!consent || !cardComplete || saving}
          >
            <Text style={styles.primaryButtonText}>{saving ? "Saving booking card..." : "Save booking card"}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {!showSaved && session?.provider === "cardpointe" ? (
        <>
          {session.tokenizer_url ? (
            <WebView source={{ uri: session.tokenizer_url }} onMessage={handleTokenizerMessage} style={styles.webview} />
          ) : null}
          {last4 && expiration ? (
            <Text style={styles.metaText}>
              Card ending in {last4} · Expires {expirationParts(expiration).label}
            </Text>
          ) : null}
          <TextInput style={styles.input} placeholder="Name on card" value={billingName} onChangeText={setBillingName} />
          <TextInput style={styles.input} placeholder="Billing ZIP" value={billingZip} onChangeText={setBillingZip} />
          <TouchableOpacity
            style={[styles.primaryButton, (!consent || !cardToken || !last4 || !expiration || saving) && styles.disabledButton]}
            onPress={saveCardPointeCard}
            disabled={!consent || !cardToken || !last4 || !expiration || saving}
          >
            <Text style={styles.primaryButtonText}>{saving ? "Saving booking card..." : "Save booking card"}</Text>
          </TouchableOpacity>
        </>
      ) : null}
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  consentRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: "#9CA3AF",
    marginTop: 1,
  },
  checkboxActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  consentText: {
    flex: 1,
    fontSize: 12,
    color: "#4B5563",
  },
  cardFieldContainer: {
    height: 48,
    marginTop: 12,
  },
  webview: {
    marginTop: 12,
    height: 220,
    borderRadius: 10,
  },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: "#FFFFFF",
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#111827",
    paddingVertical: 11,
    borderRadius: 10,
    alignItems: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  secondaryButton: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    paddingVertical: 9,
    borderRadius: 10,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#111827",
    fontWeight: "600",
  },
  savedList: {
    marginTop: 10,
    gap: 8,
  },
  savedCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
  },
  savedCardText: {
    color: "#374151",
    fontSize: 13,
  },
  metaText: {
    marginTop: 8,
    fontSize: 12,
    color: "#4B5563",
  },
  message: {
    marginTop: 10,
    color: "#DC2626",
    fontSize: 12,
  },
});

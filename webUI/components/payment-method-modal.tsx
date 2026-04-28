"use client";

import { useEffect, useMemo, useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface SetupSession {
  provider: "stripe" | "cardpointe";
  owner_payment_setting_public_id: string;
  provider_customer_id: string | null;
  client_secret: string | null;
  setup_intent_id: string | null;
  publishable_key: string | null;
  tokenizer_url: string | null;
}

interface SavedMethod {
  public_id: string;
}

interface SavedMethodSummary {
  public_id: string;
  provider: string;
  brand: string | null;
  last4: string | null;
  exp_month: number | null;
  exp_year: number | null;
  is_default_for_owner: boolean;
  status: string;
}

function useStripePromise(publishableKey: string | null) {
  return useMemo<Promise<Stripe | null> | null>(() => {
    if (!publishableKey) return null;
    return loadStripe(publishableKey);
  }, [publishableKey]);
}

function StripeSetupForm({
  spacePublicId,
  session,
  billingName,
  billingZip,
  consent,
  onBillingName,
  onBillingZip,
  onConsent,
  onSaved,
}: {
  spacePublicId: string;
  session: SetupSession;
  billingName: string;
  billingZip: string;
  consent: boolean;
  onBillingName: (value: string) => void;
  onBillingZip: (value: string) => void;
  onConsent: (value: boolean) => void;
  onSaved: (publicId: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!stripe || !elements || !session.client_secret) return;
    setSaving(true);
    setMessage("");
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card form is not ready");
      const result = await stripe.confirmCardSetup(session.client_secret, {
        payment_method: {
          card,
          billing_details: {
            name: billingName || undefined,
            address: billingZip ? { postal_code: billingZip } : undefined,
          },
        },
      });
      if (result.error) {
        throw new Error(result.error.message || "Card setup failed");
      }
      const token = getAccessToken() ?? undefined;
      const saved = await apiFetch<SavedMethod>(
        "/api/payment-methods",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spacePublicId,
            owner_payment_setting_public_id: session.owner_payment_setting_public_id,
            provider_customer_id: session.provider_customer_id,
            setup_intent_id: result.setupIntent?.id || session.setup_intent_id,
            provider_payment_method_id:
              typeof result.setupIntent?.payment_method === "string"
                ? result.setupIntent.payment_method
                : undefined,
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

  return (
    <div className="grid gap-4">
      <CardElement className="rounded-md border border-border p-3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={billingName} onChange={(e) => onBillingName(e.target.value)} placeholder="Name on card" />
        <Input value={billingZip} onChange={(e) => onBillingZip(e.target.value)} placeholder="Billing ZIP" />
      </div>
      <label className="flex items-start gap-3 text-sm text-textSecondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onConsent(event.target.checked)}
          className="mt-1"
        />
        <span>I authorize this owner to charge my card upon approval.</span>
      </label>
      {message ? <div className="text-sm text-error">{message}</div> : null}
      <Button onClick={save} disabled={!stripe || saving || !consent}>
        {saving ? "Saving..." : "Save payment method"}
      </Button>
    </div>
  );
}

function CardPointeSetupForm({
  spacePublicId,
  session,
  billingName,
  billingZip,
  consent,
  onBillingName,
  onBillingZip,
  onConsent,
  onSaved,
}: {
  spacePublicId: string;
  session: SetupSession;
  billingName: string;
  billingZip: string;
  consent: boolean;
  onBillingName: (value: string) => void;
  onBillingZip: (value: string) => void;
  onConsent: (value: boolean) => void;
  onSaved: (publicId: string) => void;
}) {
  const [tokenValue, setTokenValue] = useState("");
  const [last4, setLast4] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = typeof event.data === "string" ? safeJson(event.data) : event.data;
      if (!data || typeof data !== "object") return;
      const nextToken = data.token || data.card_token || data.account;
      if (typeof nextToken === "string") setTokenValue(nextToken);
      const nextLast4 = data.last4 || String(nextToken || "").slice(-4);
      if (typeof nextLast4 === "string") setLast4(nextLast4);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const token = getAccessToken() ?? undefined;
      const saved = await apiFetch<SavedMethod>(
        "/api/payment-methods",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spacePublicId,
            owner_payment_setting_public_id: session.owner_payment_setting_public_id,
            card_token: tokenValue,
            last4: last4 || tokenValue.slice(-4),
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

  return (
    <div className="grid gap-4">
      {session.tokenizer_url ? (
        <iframe title="CardPointe tokenizer" src={session.tokenizer_url} className="h-48 w-full rounded-md border border-border" />
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={billingName} onChange={(e) => onBillingName(e.target.value)} placeholder="Name on card" />
        <Input value={billingZip} onChange={(e) => onBillingZip(e.target.value)} placeholder="Billing ZIP" />
      </div>
      <label className="flex items-start gap-3 text-sm text-textSecondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => onConsent(event.target.checked)}
          className="mt-1"
        />
        <span>I authorize this owner to charge my card upon approval.</span>
      </label>
      {message ? <div className="text-sm text-error">{message}</div> : null}
      <Button onClick={save} disabled={saving || !consent || !tokenValue}>
        {saving ? "Saving..." : "Save payment method"}
      </Button>
    </div>
  );
}

function safeJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function PaymentMethodModal({
  open,
  spacePublicId,
  onClose,
  onSaved,
}: {
  open: boolean;
  spacePublicId: string;
  onClose: () => void;
  onSaved: (paymentMethodPublicId: string) => void;
}) {
  const [session, setSession] = useState<SetupSession | null>(null);
  const [savedMethods, setSavedMethods] = useState<SavedMethodSummary[]>([]);
  const [methodsLoaded, setMethodsLoaded] = useState(false);
  const [mode, setMode] = useState<"select" | "add">("select");
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [savingExisting, setSavingExisting] = useState(false);
  const [message, setMessage] = useState("");
  const [billingName, setBillingName] = useState("");
  const [billingZip, setBillingZip] = useState("");
  const [consent, setConsent] = useState(false);
  const stripePromise = useStripePromise(session?.publishable_key ?? null);

  // Load saved methods scoped to this space's owner.
  useEffect(() => {
    if (!open || !spacePublicId) return;
    const token = getAccessToken() ?? undefined;
    setMessage("");
    setMethodsLoaded(false);
    apiFetch<SavedMethodSummary[]>(
      `/api/payment-methods?space_public_id=${encodeURIComponent(spacePublicId)}`,
      { method: "GET" },
      token,
    )
      .then((methods) => {
        setSavedMethods(methods);
        if (methods.length === 0) {
          setMode("add");
        } else {
          setMode("select");
          const def = methods.find((m) => m.is_default_for_owner) || methods[0];
          setSelectedMethodId(def?.public_id ?? null);
        }
      })
      .catch(() => {
        setSavedMethods([]);
        setMode("add");
      })
      .finally(() => setMethodsLoaded(true));
  }, [open, spacePublicId]);

  // Lazy-load setup session only when adding a new card.
  useEffect(() => {
    if (!open || !spacePublicId || mode !== "add") return;
    if (session) return;
    const token = getAccessToken() ?? undefined;
    setMessage("");
    apiFetch<SetupSession>(
      "/api/payment-methods/setup-session",
      {
        method: "POST",
        body: JSON.stringify({ space_public_id: spacePublicId }),
      },
      token,
    )
      .then(setSession)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Unable to start payment setup"));
  }, [open, spacePublicId, mode, session]);

  function useExisting() {
    if (!selectedMethodId) return;
    if (!consent) {
      setMessage("Please authorize the charge before continuing.");
      return;
    }
    setSavingExisting(true);
    try {
      onSaved(selectedMethodId);
    } finally {
      setSavingExisting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-surface p-5 shadow-lg">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <div className="text-base font-semibold text-textPrimary">
              {mode === "select" && savedMethods.length > 0 ? "Choose payment method" : "Add payment method"}
            </div>
            <p className="mt-1 text-sm text-textSecondary">
              You won&apos;t be charged now. Your card is only charged if the owner approves.
            </p>
          </div>
          <button onClick={onClose} className="text-sm text-textMuted">
            Close
          </button>
        </div>

        {message ? <div className="mb-3 text-sm text-error">{message}</div> : null}
        {!methodsLoaded ? <div className="text-sm text-textMuted">Loading...</div> : null}

        {methodsLoaded && mode === "select" && savedMethods.length > 0 ? (
          <div className="grid gap-3">
            <div className="grid gap-2">
              {savedMethods.map((method) => (
                <label
                  key={method.public_id}
                  className={`flex items-center justify-between gap-3 rounded-md border p-3 text-sm ${
                    selectedMethodId === method.public_id
                      ? "border-accent bg-surface2"
                      : "border-border"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="radio"
                      name="saved-method"
                      checked={selectedMethodId === method.public_id}
                      onChange={() => setSelectedMethodId(method.public_id)}
                    />
                    <div>
                      <div className="font-medium text-textPrimary">
                        {(method.brand || "Card").toUpperCase()} •••• {method.last4 || "----"}
                      </div>
                      <div className="text-xs text-textMuted">
                        {method.exp_month != null && method.exp_year != null
                          ? `Expires ${String(method.exp_month).padStart(2, "0")}/${method.exp_year}`
                          : method.provider}
                        {method.is_default_for_owner ? " • Default" : ""}
                      </div>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <label className="flex items-start gap-3 text-sm text-textSecondary">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
                className="mt-1"
              />
              <span>I authorize this owner to charge my card upon approval.</span>
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={useExisting} disabled={!selectedMethodId || !consent || savingExisting}>
                {savingExisting ? "Continuing..." : "Use this card"}
              </Button>
              <Button variant="secondary" onClick={() => setMode("add")}>
                Add new card
              </Button>
            </div>
          </div>
        ) : null}

        {methodsLoaded && mode === "add" && !session && !message ? (
          <div className="text-sm text-textMuted">Preparing secure form...</div>
        ) : null}

        {mode === "add" && session?.provider === "stripe" && stripePromise ? (
          <>
            <Elements stripe={stripePromise}>
              <StripeSetupForm
                spacePublicId={spacePublicId}
                session={session}
                billingName={billingName}
                billingZip={billingZip}
                consent={consent}
                onBillingName={setBillingName}
                onBillingZip={setBillingZip}
                onConsent={setConsent}
                onSaved={onSaved}
              />
            </Elements>
            {savedMethods.length > 0 ? (
              <button
                onClick={() => setMode("select")}
                className="mt-3 text-sm text-accent hover:underline"
              >
                ← Use a saved card instead
              </button>
            ) : null}
          </>
        ) : null}

        {mode === "add" && session?.provider === "cardpointe" ? (
          <>
            <CardPointeSetupForm
              spacePublicId={spacePublicId}
              session={session}
              billingName={billingName}
              billingZip={billingZip}
              consent={consent}
              onBillingName={setBillingName}
              onBillingZip={setBillingZip}
              onConsent={setConsent}
              onSaved={onSaved}
            />
            {savedMethods.length > 0 ? (
              <button
                onClick={() => setMode("select")}
                className="mt-3 text-sm text-accent hover:underline"
              >
                ← Use a saved card instead
              </button>
            ) : null}
          </>
        ) : null}
      </div>
    </div>
  );
}

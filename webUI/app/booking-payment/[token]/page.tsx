"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CardElement, Elements, useElements, useStripe } from "@stripe/react-stripe-js";
import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { CheckCircle2, CreditCard, LockKeyhole, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";

interface LinkDetails {
  public_id: string;
  status: string;
  expires_at: string;
  request_public_id: string;
  booking_public_id: string | null;
  space_name: string | null;
  location_name: string | null;
  start_datetime: string;
  end_datetime: string;
  member_email: string;
  member_name: string | null;
  amount_cents: number;
  currency: string;
  provider: "stripe" | "cardpointe";
  publishable_key: string | null;
  tokenizer_url: string | null;
}

interface ChargeResponse {
  status: string;
  request_public_id: string;
  booking_public_id: string | null;
  payment_public_id: string | null;
}

function formatAmount(cents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function normalizeLast4(value: string | null): string {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : "";
}

function normalizeExpiration(value: string | null): string {
  const digits = (value || "").replace(/\D/g, "");
  if (digits.length === 4) return `${digits.slice(0, 2)}${digits.slice(2)}`;
  if (digits.length === 6) return `${digits.slice(0, 2)}${digits.slice(4)}`;
  return "";
}

function last4FromToken(value: string | null): string {
  return normalizeLast4(value);
}

function StripePaymentForm({
  token,
  details,
  onPaid,
}: {
  token: string;
  details: LinkDetails;
  onPaid: (message: string) => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [billingName, setBillingName] = useState(details.member_name || "");
  const [billingZip, setBillingZip] = useState("");
  const [message, setMessage] = useState("");
  const [paying, setPaying] = useState(false);

  async function pay() {
    if (!stripe || !elements) return;
    setPaying(true);
    setMessage("");
    try {
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card form is not ready");
      const intent = await apiFetch<{ client_secret: string; publishable_key: string }>(
        `/api/booking-payment-links/${encodeURIComponent(token)}/stripe-intent`,
        { method: "POST" },
      );
      const result = await stripe.confirmCardPayment(intent.client_secret, {
        payment_method: {
          card,
          billing_details: {
            name: billingName || undefined,
            email: details.member_email,
            address: billingZip ? { postal_code: billingZip } : undefined,
          },
        },
      });
      if (result.error) throw new Error(result.error.message || "Payment failed");
      if (result.paymentIntent?.status !== "succeeded") {
        throw new Error("Payment was not completed");
      }
      onPaid("Payment complete. Your booking will show as confirmed shortly.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to process payment");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="grid gap-4">
      <CardElement className="rounded-xl border border-line-strong bg-surface p-3" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={billingName}
          onChange={(event) => setBillingName(event.target.value)}
          placeholder="Name on card"
          data-testid="booking-payment-billing-name"
        />
        <Input
          value={billingZip}
          onChange={(event) => setBillingZip(event.target.value)}
          placeholder="Billing ZIP"
          data-testid="booking-payment-billing-zip"
        />
      </div>
      {message ? <div className="text-[13px] text-danger">{message}</div> : null}
      <Button
        type="button"
        variant="primary"
        onClick={pay}
        disabled={!stripe || paying}
        data-testid="booking-payment-pay-button"
      >
        <CreditCard size={15} />
        {paying ? "Processing..." : `Pay ${formatAmount(details.amount_cents)}`}
      </Button>
    </div>
  );
}

function CardPointePaymentForm({
  token,
  details,
  onPaid,
}: {
  token: string;
  details: LinkDetails;
  onPaid: (message: string) => void;
}) {
  const [cardToken, setCardToken] = useState("");
  const [last4, setLast4] = useState("");
  const [expiration, setExpiration] = useState("");
  const [billingName, setBillingName] = useState(details.member_name || "");
  const [billingZip, setBillingZip] = useState("");
  const [message, setMessage] = useState("");
  const [paying, setPaying] = useState(false);

  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      const data = typeof event.data === "string" ? safeJson(event.data) : event.data;
      const nextToken =
        typeof event.data === "string" && !data
          ? event.data
          : firstString(data?.token, data?.card_token, data?.account, data?.message);
      if (nextToken) setCardToken(nextToken);
      const nextLast4 = normalizeLast4(firstString(data?.last4, data?.last_four, data?.lastFour)) || last4FromToken(nextToken);
      if (nextLast4) setLast4(nextLast4);
      const nextExpiration = normalizeExpiration(
        firstString(data?.expiration, data?.expiry, data?.exp, data?.expiry_date, data?.expiryDate),
      );
      if (nextExpiration) setExpiration(nextExpiration);
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  async function pay() {
    const normalizedLast4 = normalizeLast4(last4) || last4FromToken(cardToken);
    const normalizedExpiration = normalizeExpiration(expiration);
    if (!cardToken || !normalizedLast4 || !normalizedExpiration) {
      setMessage("Card details are incomplete. Re-enter the card details.");
      return;
    }
    setPaying(true);
    setMessage("");
    try {
      await apiFetch<ChargeResponse>(
        `/api/booking-payment-links/${encodeURIComponent(token)}/cardpointe-charge`,
        {
          method: "POST",
          body: JSON.stringify({
            card_token: cardToken,
            last4: normalizedLast4,
            expiration: normalizedExpiration,
            brand: "card",
            billing_name: billingName || null,
            billing_zip: billingZip || null,
          }),
        },
      );
      onPaid("Payment complete. Your booking is confirmed.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to process payment");
    } finally {
      setPaying(false);
    }
  }

  return (
    <div className="grid gap-4">
      {details.tokenizer_url ? (
        <iframe
          title="CardPointe tokenizer"
          src={details.tokenizer_url}
          className="h-52 w-full rounded-xl border border-line-strong bg-surface"
        />
      ) : (
        <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
          CardPointe tokenizer is not configured.
        </div>
      )}
      {last4 && expiration ? (
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2 text-[13px] text-text-2">
          Card ending in {last4}
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          value={billingName}
          onChange={(event) => setBillingName(event.target.value)}
          placeholder="Name on card"
          data-testid="booking-payment-cardpointe-name"
        />
        <Input
          value={billingZip}
          onChange={(event) => setBillingZip(event.target.value)}
          placeholder="Billing ZIP"
          data-testid="booking-payment-cardpointe-zip"
        />
      </div>
      {message ? <div className="text-[13px] text-danger">{message}</div> : null}
      <Button
        type="button"
        variant="primary"
        onClick={pay}
        disabled={paying || !cardToken}
        data-testid="booking-payment-cardpointe-pay-button"
      >
        <CreditCard size={15} />
        {paying ? "Processing..." : `Pay ${formatAmount(details.amount_cents)}`}
      </Button>
    </div>
  );
}

export default function BookingPaymentLinkPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [details, setDetails] = useState<LinkDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [paidMessage, setPaidMessage] = useState("");
  const stripePublishableKey = details?.provider === "stripe" ? details.publishable_key : null;

  const stripePromise = useMemo<Promise<Stripe | null> | null>(() => {
    if (!stripePublishableKey) return null;
    return loadStripe(stripePublishableKey);
  }, [stripePublishableKey]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setMessage("");
    apiFetch<LinkDetails>(`/api/booking-payment-links/${encodeURIComponent(token)}`, {
      method: "GET",
    })
      .then((resp) => {
        if (active) setDetails(resp);
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Payment link is unavailable");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-text sm:px-6 lg:px-8">
      <div className="mx-auto grid min-h-[calc(100vh-3rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[minmax(0,0.85fr)_minmax(360px,0.65fr)]">
        <section>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-[12px] font-semibold text-text-3">
            <LockKeyhole size={13} />
            Secure Priddyspaces payment
          </div>
          <h1 className="text-3xl font-semibold tracking-normal text-text sm:text-4xl">
            Complete your booking payment
          </h1>
          <p className="mt-3 max-w-xl text-[15px] leading-6 text-text-3">
            Pay this booking link before the hold expires. After payment, your booking is confirmed and available in your member account.
          </p>
          {details ? (
            <div className="mt-6 grid gap-3 text-[13px] text-text-2">
              <div>
                <span className="font-semibold text-text">{details.space_name || "Space"}</span>
                {details.location_name ? ` at ${details.location_name}` : ""}
              </div>
              <div>
                {formatDateTime(details.start_datetime)} - {formatDateTime(details.end_datetime)}
              </div>
              <div>Member: {details.member_name || details.member_email}</div>
              <div>Hold expires: {new Date(details.expires_at).toLocaleString()}</div>
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
          {loading ? (
            <div className="flex items-center gap-2 text-[13px] text-text-3">
              <RefreshCw size={14} className="animate-spin" />
              Loading payment link...
            </div>
          ) : message ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-3 text-[13px] text-danger">
              {message}
            </div>
          ) : paidMessage ? (
            <div className="rounded-xl border border-success/30 bg-success-soft px-3 py-3 text-[13px] text-success">
              <div className="flex items-center gap-2 font-semibold">
                <CheckCircle2 size={15} />
                Payment complete
              </div>
              <div className="mt-1 text-text-2">{paidMessage}</div>
            </div>
          ) : details ? (
            <div className="grid gap-5">
              <div>
                <div className="text-[12px] font-semibold uppercase text-text-3">Amount due</div>
                <div className="mt-1 font-mono text-3xl font-semibold text-text">
                  {formatAmount(details.amount_cents)}
                </div>
              </div>
              {details.provider === "stripe" && stripePromise ? (
                <Elements stripe={stripePromise}>
                  <StripePaymentForm token={token} details={details} onPaid={setPaidMessage} />
                </Elements>
              ) : details.provider === "cardpointe" ? (
                <CardPointePaymentForm token={token} details={details} onPaid={setPaidMessage} />
              ) : (
                <div className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
                  Payment provider is not configured.
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

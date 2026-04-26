"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

function SubscriptionForm({
  spacePublicId,
  planPublicId,
  planName,
  onDone
}: {
  spacePublicId: string;
  planPublicId: string;
  planName: string;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubscribe() {
    if (!stripe || !elements) return;
    setLoading(true);
    setMessage("");
    try {
      const token = getAccessToken() ?? undefined;
      const res = await apiFetch<{ client_secret: string | null }>(
        "/api/payments/subscription",
        {
          method: "POST",
          body: JSON.stringify({
            space_public_id: spacePublicId,
            subscription_plan_public_id: planPublicId
          })
        },
        token
      );
      if (!res.client_secret) {
        setMessage("Subscription started");
        onDone();
        return;
      }
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card element not ready");
      const result = await stripe.confirmCardPayment(res.client_secret, {
        payment_method: { card }
      });
      if (result.error) {
        throw new Error(result.error.message || "Payment failed");
      }
      setMessage("Subscription active");
      onDone();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Subscription failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="text-sm text-textSecondary">Subscribe to {planName}</div>
      <CardElement className="rounded-md border border-border p-3" />
      {message ? <div className="text-xs text-textMuted">{message}</div> : null}
      <Button size="sm" onClick={handleSubscribe} disabled={loading || !stripe}>
        {loading ? "Processing..." : "Start membership"}
      </Button>
    </Card>
  );
}

export function SubscriptionModal({
  open,
  spacePublicId,
  planPublicId,
  planName,
  onClose,
  onDone
}: {
  open: boolean;
  spacePublicId: string;
  planPublicId: string;
  planName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-textPrimary">Membership</div>
          <button onClick={onClose} className="text-xs text-textMuted">
            Close
          </button>
        </div>
        <Elements stripe={stripePromise}>
          <SubscriptionForm
            spacePublicId={spacePublicId}
            planPublicId={planPublicId}
            planName={planName}
            onDone={onDone}
          />
        </Elements>
      </div>
    </div>
  );
}

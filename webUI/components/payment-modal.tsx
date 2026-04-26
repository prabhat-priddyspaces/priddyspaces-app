"use client";

import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useElements, useStripe } from "@stripe/react-stripe-js";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

function PaymentForm({
  bookingPublicId,
  amount,
  onDone
}: {
  bookingPublicId: string;
  amount: number;
  onDone: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function handlePay() {
    if (!stripe || !elements) return;
    setLoading(true);
    setMessage("");
    try {
      const token = getAccessToken() ?? undefined;
      const intent = await apiFetch<{ client_secret: string }>(
        "/api/payments/intent",
        {
          method: "POST",
          body: JSON.stringify({
            currency: "usd",
            booking_public_id: bookingPublicId
          })
        },
        token
      );
      const card = elements.getElement(CardElement);
      if (!card) throw new Error("Card element not ready");
      const result = await stripe.confirmCardPayment(intent.client_secret, {
        payment_method: { card }
      });
      if (result.error) {
        throw new Error(result.error.message || "Payment failed");
      }
      setMessage("Payment complete");
      onDone();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="text-sm text-textSecondary">Card details</div>
      <CardElement className="rounded-md border border-border p-3" />
      {message ? <div className="text-xs text-textMuted">{message}</div> : null}
      <Button size="sm" onClick={handlePay} disabled={loading || !stripe}>
        {loading ? "Processing..." : `Pay $${amount}`}
      </Button>
    </Card>
  );
}

export function PaymentModal({
  open,
  bookingPublicId,
  amount,
  onClose,
  onDone
}: {
  open: boolean;
  bookingPublicId: string;
  amount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-surface p-4 shadow-lg">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold text-textPrimary">Complete payment</div>
          <button onClick={onClose} className="text-xs text-textMuted">
            Close
          </button>
        </div>
        <Elements stripe={stripePromise}>
          <PaymentForm bookingPublicId={bookingPublicId} amount={amount} onDone={onDone} />
        </Elements>
      </div>
    </div>
  );
}

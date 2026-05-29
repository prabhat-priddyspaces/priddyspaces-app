"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { buildLoginHref } from "@/lib/auth-redirect";
import { formatUsd, type MoneyValue } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubscriptionModal } from "@/components/subscription-modal";
import { PaymentMethodModal } from "@/components/payment-method-modal";

interface Space {
  public_id: string;
  organization_name: string | null;
  space_type: string;
  capacity: number;
  price_monthly: MoneyValue | null;
  price_daily: MoneyValue | null;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
  amenities: string | null;
}

interface SpaceImage {
  public_id: string;
  image_url: string;
  is_primary: boolean;
}

interface SubscriptionPlan {
  public_id: string;
  name: string;
  billing_cycle: string;
  price: number;
  is_active: boolean;
}

interface SpaceDetailViewProps {
  spaceId: string;
  backHref: string;
}

interface PaymentMethodResolve {
  is_configured: boolean;
  has_payment_method: boolean;
  payment_method_public_id: string | null;
  message: string | null;
}

interface ReservationPayload {
  space_public_id: string;
  start_datetime: string;
  end_datetime: string;
}

export function SpaceDetailView({ spaceId, backHref }: SpaceDetailViewProps) {
  const router = useRouter();
  const [space, setSpace] = useState<Space | null>(null);
  const [images, setImages] = useState<SpaceImage[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [startDatetime, setStartDatetime] = useState("");
  const [endDatetime, setEndDatetime] = useState("");
  const [requesting, setRequesting] = useState(false);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<ReservationPayload | null>(null);
  const [authorizationConsent, setAuthorizationConsent] = useState(false);
  const isAuthenticated = useMemo(() => Boolean(getAccessToken()), []);
  const organizationName = space?.organization_name?.trim() || null;
  const chargeOwnerName = organizationName || "this owner";

  useEffect(() => {
    if (!spaceId) return;
    setLoading(true);
    Promise.all([
      apiFetch<Space>(`/api/spaces/${spaceId}`, { method: "GET" }),
      apiFetch<SpaceImage[]>(`/api/spaces/${spaceId}/media`, { method: "GET" }).catch(
        () => []
      ),
      apiFetch<SubscriptionPlan[]>(
        `/api/subscription-plans/public?space_public_id=${encodeURIComponent(spaceId)}`,
        { method: "GET" }
      ).catch(() => []),
    ])
      .then(([spaceResp, imageResp, planResp]) => {
        setSpace(spaceResp);
        setImages(imageResp);
        setPlans(planResp);
      })
      .catch((err) => setError(err?.message || "Failed to load space"))
      .finally(() => setLoading(false));
  }, [spaceId]);

  function buildSelfNextHref() {
    return `/member/spaces/${spaceId}`;
  }

  async function submitRequest(payload: ReservationPayload, paymentMethodPublicId: string | null) {
    const token = getAccessToken() ?? undefined;
    if (!token) {
      router.push(buildLoginHref(buildSelfNextHref()));
      return;
    }
    setRequesting(true);
    setError("");
    try {
      await apiFetch(
        "/api/booking-requests",
        {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            member_owner_payment_method_public_id: paymentMethodPublicId,
            payment_authorization_consent: true,
          }),
        },
        token
      );
      router.push("/member/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRequesting(false);
    }
  }

  async function handleRequest() {
    if (!startDatetime || !endDatetime) {
      setError("Please select start and end date/time.");
      return;
    }
    if (!space) return;

    const token = getAccessToken() ?? undefined;
    if (!token) {
      router.push(buildLoginHref(buildSelfNextHref()));
      return;
    }
    if (!authorizationConsent) {
      setError("Authorize payment on approval before requesting.");
      return;
    }

    setRequesting(true);
    setError("");
    try {
      const payload = {
        space_public_id: space.public_id,
        start_datetime: new Date(startDatetime).toISOString(),
        end_datetime: new Date(endDatetime).toISOString(),
      };
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(space.public_id)}`,
        { method: "GET" },
        token
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || `${chargeOwnerName === "this owner" ? "This owner" : chargeOwnerName} has not configured payments.`);
      }
      if (!resolved.has_payment_method) {
        setPendingReservation(payload);
        setPaymentMethodOpen(true);
        return;
      }
      await submitRequest(payload, resolved.payment_method_public_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRequesting(false);
    }
  }

  function handleMembershipClick(plan: SubscriptionPlan) {
    if (!getAccessToken()) {
      router.push(buildLoginHref(buildSelfNextHref()));
      return;
    }
    setSelectedPlan(plan);
    setSubscriptionOpen(true);
  }

  const hero = images.find((img) => img.is_primary) || images[0];

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <Link href={backHref} className="text-sm text-accent hover:underline">
          Back to search
        </Link>
        {loading ? (
          <div className="mt-6 text-sm text-textMuted">Loading...</div>
        ) : error && !space ? (
          <div className="mt-6 text-sm text-error">{error}</div>
        ) : space ? (
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="space-y-4">
              {hero ? (
                <div className="overflow-hidden rounded-lg border border-border">
                  <img src={hero.image_url} alt="Space" className="h-72 w-full object-cover" />
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-textMuted">
                  No images yet.
                </div>
              )}
              {images.length > 1 ? (
                <div className="grid gap-3 sm:grid-cols-3">
                  {images.map((img) => (
                    <Card key={img.public_id} className="overflow-hidden">
                      <img src={img.image_url} alt="Space" className="h-28 w-full object-cover" />
                    </Card>
                  ))}
                </div>
              ) : null}
            </div>
            <Card className="space-y-4 p-5">
              <div>
                <h1 className="text-2xl font-semibold text-textPrimary">{space.space_type}</h1>
                <p className="mt-1 text-sm text-textSecondary">
                  Capacity {space.capacity} • {space.availability_status}
                </p>
                {space.availability_start_time || space.availability_end_time ? (
                  <p className="mt-1 text-sm text-textMuted">
                    Hours: {space.availability_start_time || "—"} to {space.availability_end_time || "—"}
                  </p>
                ) : null}
                {space.amenities ? (
                  <p className="mt-1 text-sm text-textMuted">Amenities: {space.amenities}</p>
                ) : null}
                <p className="mt-2 text-sm text-textMuted">
                  {space.price_monthly != null && `${formatUsd(space.price_monthly, "/mo")} `}
                  {space.price_daily != null && formatUsd(space.price_daily, "/day")}
                </p>
              </div>
              {error ? <div className="text-sm text-error">{error}</div> : null}
              {!isAuthenticated ? (
                <div className="rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                  You can browse spaces without signing in. Sign in when you are ready to request a
                  booking or start a membership.
                </div>
              ) : null}
              <div className="space-y-2">
                <Label>Start</Label>
                <Input
                  type="datetime-local"
                  value={startDatetime}
                  onChange={(e) => setStartDatetime(e.target.value)}
                />
                <Label>End</Label>
                <Input
                  type="datetime-local"
                  value={endDatetime}
                  onChange={(e) => setEndDatetime(e.target.value)}
                />
                {isAuthenticated ? (
                  <label className="flex items-start gap-3 rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                    <input
                      type="checkbox"
                      checked={authorizationConsent}
                      onChange={(event) => setAuthorizationConsent(event.target.checked)}
                      className="mt-1"
                    />
                    <span>I authorize {chargeOwnerName} to charge my card upon approval.</span>
                  </label>
                ) : null}
                <Button onClick={handleRequest} disabled={requesting}>
                  {requesting
                    ? "Sending..."
                    : isAuthenticated
                      ? "Request booking"
                      : "Sign in to request booking"}
                </Button>
              </div>
              {plans.length > 0 ? (
                <div className="space-y-3 border-t border-border pt-4">
                  <div className="text-sm font-semibold text-textPrimary">Membership plans</div>
                  {plans.map((plan) => (
                    <div key={plan.public_id} className="rounded-md border border-border p-3">
                      <div className="text-sm font-semibold text-textPrimary">{plan.name}</div>
                      <div className="text-xs text-textMuted">
                        {plan.billing_cycle} • ${plan.price}
                      </div>
                      <Button
                        size="sm"
                        className="mt-2"
                        onClick={() => handleMembershipClick(plan)}
                      >
                        {isAuthenticated ? "Start membership" : "Sign in to start membership"}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>
          </div>
        ) : null}
      </div>
      {selectedPlan ? (
        <SubscriptionModal
          open={subscriptionOpen}
          spacePublicId={spaceId}
          planPublicId={selectedPlan.public_id}
          planName={selectedPlan.name}
          onClose={() => setSubscriptionOpen(false)}
          onDone={() => {
            setSubscriptionOpen(false);
            router.push("/member/subscriptions");
          }}
        />
      ) : null}
      {space ? (
        <PaymentMethodModal
          open={paymentMethodOpen}
          spacePublicId={space.public_id}
          organizationName={organizationName}
          onClose={() => setPaymentMethodOpen(false)}
          onSaved={(paymentMethodPublicId) => {
            setPaymentMethodOpen(false);
            if (pendingReservation) {
              submitRequest(pendingReservation, paymentMethodPublicId).catch(() => null);
            }
          }}
        />
      ) : null}
    </main>
  );
}

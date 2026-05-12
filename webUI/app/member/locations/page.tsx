"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PaymentMethodModal } from "@/components/payment-method-modal";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface Location {
  public_id: string;
  name: string;
  address: string;
  city: string | null;
  timezone: string;
}

interface Space {
  public_id: string;
  space_type: string;
  capacity: number;
  price_monthly: number | null;
  price_daily: number | null;
  availability_status: string;
  availability_start_time: string | null;
  availability_end_time: string | null;
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

export default function MemberLocationsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const locationId = searchParams.get("locationId") ?? "";
  const [location, setLocation] = useState<Location | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!locationId);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [startDatetime, setStartDatetime] = useState("");
  const [endDatetime, setEndDatetime] = useState("");
  const [selectedSpace, setSelectedSpace] = useState<string | null>(null);
  const [authorizationConsent, setAuthorizationConsent] = useState(false);
  const [paymentMethodOpen, setPaymentMethodOpen] = useState(false);
  const [pendingReservation, setPendingReservation] = useState<ReservationPayload | null>(null);

  useEffect(() => {
    if (!locationId) {
      setLoading(false);
      return;
    }
    const token = getAccessToken() ?? undefined;
    Promise.all([
      apiFetch<Location>(`/api/locations/${locationId}`, { method: "GET" }, token),
      apiFetch<Space[]>(`/api/locations/${locationId}/spaces`, { method: "GET" }, token),
    ])
      .then(([loc, sp]) => {
        setLocation(loc);
        setSpaces(sp);
      })
      .catch((err) => setError(err?.message || "Failed to load"))
      .finally(() => setLoading(false));
  }, [locationId]);

  async function submitRequest(payload: ReservationPayload, paymentMethodPublicId: string | null) {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setRequesting(payload.space_public_id);
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
      setSelectedSpace(null);
      setStartDatetime("");
      setEndDatetime("");
      router.push("/member/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setRequesting(null);
    }
  }

  async function handleRequest(spacePublicId: string) {
    if (!startDatetime || !endDatetime) {
      setError("Please select start and end date/time.");
      return;
    }
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    if (!authorizationConsent) {
      setError("Authorize payment on approval before requesting.");
      return;
    }
    setRequesting(spacePublicId);
    setError("");
    try {
      const payload = {
        space_public_id: spacePublicId,
        start_datetime: new Date(startDatetime).toISOString(),
        end_datetime: new Date(endDatetime).toISOString(),
      };
      const resolved = await apiFetch<PaymentMethodResolve>(
        `/api/payment-methods/resolve?space_public_id=${encodeURIComponent(spacePublicId)}`,
        { method: "GET" },
        token
      );
      if (!resolved.is_configured) {
        throw new Error(resolved.message || "This owner has not configured payments.");
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
      setRequesting(null);
    }
  }

  if (!locationId) {
    return (
      <main className="min-h-screen bg-background px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <Link href="/member" className="text-sm text-accent hover:underline">
            Back to search
          </Link>
          <p className="mt-4 text-sm text-textMuted">Select a location from the search results.</p>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-6 py-8">
        <div className="mx-auto max-w-5xl text-sm text-textMuted">Loading...</div>
      </main>
    );
  }
  if (error && !location) {
    return (
      <main className="min-h-screen bg-background px-6 py-8">
        <div className="mx-auto max-w-5xl">
          <p className="text-sm text-error">{error}</p>
          <Link href="/member" className="mt-4 inline-block text-sm text-accent hover:underline">
            Back to search
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-background px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/member" className="text-sm text-accent hover:underline">
          Back to search
        </Link>
        {location ? (
          <>
            <h1 className="mt-4 text-2xl font-semibold text-textPrimary">{location.name}</h1>
            <p className="mt-1 text-textSecondary">{location.address}</p>
            {location.city ? (
              <p className="text-sm text-textMuted">{location.city}</p>
            ) : null}
          </>
        ) : null}
        {error ? (
          <p className="mt-4 text-sm text-error">{error}</p>
        ) : null}
        <h2 className="mt-8 text-lg font-semibold text-textPrimary">Spaces</h2>
        {spaces.length === 0 ? (
          <p className="mt-2 text-sm text-textMuted">No spaces available.</p>
        ) : (
          <div className="mt-4 grid gap-4">
            {spaces.map((space) => (
              <Card key={space.public_id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="font-medium text-textPrimary">{space.space_type}</div>
                    <div className="mt-1 text-sm text-textSecondary">
                      Capacity: {space.capacity} • {space.availability_status}
                    </div>
                    {space.availability_start_time || space.availability_end_time ? (
                      <div className="mt-1 text-sm text-textMuted">
                        Hours: {space.availability_start_time || "—"} to {space.availability_end_time || "—"}
                      </div>
                    ) : null}
                    <div className="mt-1 text-sm text-textMuted">
                      {space.price_monthly != null && `$${space.price_monthly}/mo `}
                      {space.price_daily != null && `$${space.price_daily}/day`}
                    </div>
                  </div>
                  <div className="min-w-[200px]">
                    {selectedSpace === space.public_id ? (
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
                        <label className="flex items-start gap-3 rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                          <input
                            type="checkbox"
                            checked={authorizationConsent}
                            onChange={(event) => setAuthorizationConsent(event.target.checked)}
                            className="mt-1"
                          />
                          <span>I authorize this owner to charge my card upon approval.</span>
                        </label>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleRequest(space.public_id)}
                            disabled={!!requesting}
                          >
                            {requesting === space.public_id ? "Sending..." : "Send request"}
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => {
                              setSelectedSpace(null);
                              setStartDatetime("");
                              setEndDatetime("");
                              setAuthorizationConsent(false);
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          onClick={() => setSelectedSpace(space.public_id)}
                        >
                          Request this space
                        </Button>
                        <Link href={`/member/spaces/${space.public_id}`}>
                          <Button size="sm" variant="secondary">
                            View details
                          </Button>
                        </Link>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {pendingReservation ? (
        <PaymentMethodModal
          open={paymentMethodOpen}
          spacePublicId={pendingReservation.space_public_id}
          onClose={() => setPaymentMethodOpen(false)}
          onSaved={(paymentMethodPublicId) => {
            setPaymentMethodOpen(false);
            submitRequest(pendingReservation, paymentMethodPublicId).catch(() => null);
          }}
        />
      ) : null}
    </main>
  );
}

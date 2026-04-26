"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Users,
} from "lucide-react";

import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  formatLocationAddress,
  formatSpaceTypeLabel,
  MarketplaceSpaceDetailResponse,
} from "@/lib/public-marketplace";
import { SubscriptionModal } from "@/components/subscription-modal";
import { PublicLocationMiniMap } from "@/components/public-location-mini-map";

interface SubscriptionPlan {
  public_id: string;
  name: string;
  billing_cycle: string;
  price: number;
  is_active: boolean;
}

interface PublicSpaceDetailViewProps {
  spaceId: string;
  backHref: string;
  initialDate?: string;
  initialStartTime?: string;
  initialEndTime?: string;
}

function toTimeInputValue(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

function buildDirectionsHref(address: string, lat: number | null, lng: number | null) {
  const query = lat != null && lng != null ? `${lat},${lng}` : address;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildInitials(name: string) {
  const parts = name.split(" ").filter(Boolean).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "VX";
}

function getPriceRows(space: MarketplaceSpaceDetailResponse["space"]) {
  const rows: Array<{ label: string; value: string }> = [];
  if (space.hourly_price != null) rows.push({ label: "Hourly", value: `$${space.hourly_price}/hour` });
  if (space.price_daily != null) rows.push({ label: "Day Rate", value: `$${space.price_daily}/day` });
  if (space.price_monthly != null) rows.push({ label: "Monthly", value: `$${space.price_monthly}/month` });
  if (space.membership_price != null) rows.push({ label: "Membership", value: `$${space.membership_price}/month` });
  return rows;
}

export function PublicSpaceDetailView({
  spaceId,
  backHref,
  initialDate = "",
  initialStartTime = "",
  initialEndTime = "",
}: PublicSpaceDetailViewProps) {
  const router = useRouter();
  const isAuthenticated = Boolean(getAccessToken());
  const [detail, setDetail] = useState<MarketplaceSpaceDetailResponse | null>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState(initialStartTime);
  const [endTime, setEndTime] = useState(initialEndTime);
  const [requesting, setRequesting] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);

  useEffect(() => {
    if (!spaceId) {
      return;
    }
    setLoading(true);
    setError("");
    Promise.all([
      apiFetch<MarketplaceSpaceDetailResponse>(`/api/marketplace/spaces/${spaceId}`, { method: "GET" }),
      apiFetch<SubscriptionPlan[]>(
        `/api/subscription-plans/public?space_public_id=${encodeURIComponent(spaceId)}`,
        { method: "GET" },
      ).catch(() => []),
    ])
      .then(([detailResponse, planResponse]) => {
        setDetail(detailResponse);
        setPlans(planResponse);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed to load listing");
        setDetail(null);
        setPlans([]);
      })
      .finally(() => setLoading(false));
  }, [spaceId]);

  useEffect(() => {
    if (!detail) {
      return;
    }
    if (!startTime && detail.space.availability_start_time) {
      setStartTime(toTimeInputValue(detail.space.availability_start_time));
    }
    if (!endTime && detail.space.availability_end_time) {
      setEndTime(toTimeInputValue(detail.space.availability_end_time));
    }
  }, [detail, endTime, startTime]);

  const images = detail?.images ?? [];
  const heroImage = images[0] ?? null;
  const galleryImages = heroImage ? images.slice(1, 5) : images.slice(0, 4);
  const priceRows = useMemo(() => (detail ? getPriceRows(detail.space) : []), [detail]);
  const primaryPrice = priceRows[0]?.value ?? "Contact for pricing";
  const locationAddress = detail ? formatLocationAddress(detail.location) : "";

  async function handleReserve() {
    if (!detail) {
      return;
    }
    if (!date || !startTime || !endTime) {
      setError("Choose a date, start time, and end time before reserving.");
      return;
    }

    const start = new Date(`${date}T${startTime}`);
    const end = new Date(`${date}T${endTime}`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      setError("End time must be after start time.");
      return;
    }

    const token = getAccessToken() ?? undefined;
    if (!token) {
      router.push("/login");
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
            space_public_id: detail.space.public_id,
            start_datetime: start.toISOString(),
            end_datetime: end.toISOString(),
          }),
        },
        token,
      );
      router.push("/customer/requests");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reservation failed");
    } finally {
      setRequesting(false);
    }
  }

  function handleMembershipClick(plan: SubscriptionPlan) {
    if (!getAccessToken()) {
      router.push("/login");
      return;
    }
    setSelectedPlan(plan);
    setSubscriptionOpen(true);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#edf5f7_100%)] px-6 py-8">
        <div className="mx-auto max-w-[1320px] text-sm text-slate-500">Loading listing…</div>
      </main>
    );
  }

  if (error && !detail) {
    return (
      <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#edf5f7_100%)] px-6 py-8">
        <div className="mx-auto max-w-[1320px]">
          <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
            <ChevronLeft className="h-4 w-4" />
            Back to search
          </Link>
          <div className="mt-6 rounded-[24px] border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700">{error}</div>
        </div>
      </main>
    );
  }

  if (!detail) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#edf5f7_100%)] px-6 py-8">
      <div className="mx-auto max-w-[1320px]">
        <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline">
          <ChevronLeft className="h-4 w-4" />
          Back to search
        </Link>

        <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-8">
            <section className="rounded-[30px] border border-white/70 bg-white p-4 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.35)]">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                <div className="overflow-hidden rounded-[24px] bg-slate-100">
                  {heroImage ? (
                    <img src={heroImage.image_url} alt={detail.space.name} className="h-full min-h-[340px] w-full object-cover" />
                  ) : (
                    <div className="flex min-h-[340px] items-center justify-center bg-[linear-gradient(135deg,_#d1fae5,_#e2e8f0)] text-sm font-semibold uppercase tracking-[0.24em] text-slate-600">
                      Priddyspaces
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {galleryImages.length > 0 ? (
                    galleryImages.map((image) => (
                      <div key={image.public_id} className="overflow-hidden rounded-[20px] bg-slate-100">
                        <img src={image.image_url} alt={detail.space.name} className="h-full min-h-[164px] w-full object-cover" />
                      </div>
                    ))
                  ) : (
                    Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={`placeholder-${index}`}
                        className="flex min-h-[164px] items-center justify-center rounded-[20px] bg-slate-100 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400"
                      >
                        Gallery
                      </div>
                    ))
                  )}
                </div>
              </div>
            </section>

            <section className="border-b border-slate-200 pb-8">
              <div className="flex flex-wrap items-start justify-between gap-6">
                <div>
                  <h1 className="text-4xl font-semibold tracking-tight text-slate-900">{detail.space.name}</h1>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                      <Users className="h-4 w-4 text-slate-500" />
                      {detail.space.capacity} seats
                    </span>
                    <span className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-slate-500" />
                      {formatSpaceTypeLabel(detail.space.space_type)}
                    </span>
                    {detail.space.amenities.slice(0, 6).map((amenity) => (
                      <span
                        key={amenity}
                        className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700"
                      >
                        {amenity}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="min-w-[220px] rounded-[24px] border border-teal-200 bg-teal-50 px-5 py-4">
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-teal-700">Pricing</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{primaryPrice}</div>
                  {priceRows.length > 1 ? (
                    <div className="mt-3 space-y-2 text-sm text-slate-600">
                      {priceRows.slice(1).map((row) => (
                        <div key={row.label} className="flex items-center justify-between gap-4">
                          <span>{row.label}</span>
                          <span className="font-medium text-slate-900">{row.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </section>

            <section className="grid gap-8 border-b border-slate-200 pb-8 md:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
              <div className="space-y-5">
                <div>
                  <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">Located At</div>
                  <div className="mt-2 text-2xl font-semibold text-slate-900">{detail.location.name}</div>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{locationAddress}</p>
                  <a
                    href={buildDirectionsHref(locationAddress, detail.location.lat, detail.location.lng)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-teal-700 hover:underline"
                  >
                    Get directions
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </div>

                <PublicLocationMiniMap
                  lat={detail.location.lat}
                  lng={detail.location.lng}
                  name={detail.location.name}
                />
              </div>

              <div className="grid gap-5">
                {(detail.location.public_hours_weekdays || detail.location.public_hours_weekends) ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="text-sm font-semibold text-slate-900">Hours</div>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      {detail.location.public_hours_weekdays ? (
                        <div className="flex items-start gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{detail.location.public_hours_weekdays}</span>
                        </div>
                      ) : null}
                      {detail.location.public_hours_weekends ? (
                        <div className="flex items-start gap-3">
                          <Clock3 className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{detail.location.public_hours_weekends}</span>
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {(detail.location.public_phone || detail.location.public_email) ? (
                  <div className="rounded-[24px] border border-slate-200 bg-white p-5">
                    <div className="text-sm font-semibold text-slate-900">Questions About This Listing?</div>
                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                      {detail.location.public_phone ? (
                        <a href={`tel:${detail.location.public_phone}`} className="flex items-center gap-3 hover:text-slate-900">
                          <Phone className="h-4 w-4 text-slate-400" />
                          {detail.location.public_phone}
                        </a>
                      ) : null}
                      {detail.location.public_email ? (
                        <a href={`mailto:${detail.location.public_email}`} className="flex items-center gap-3 hover:text-slate-900">
                          <Mail className="h-4 w-4 text-slate-400" />
                          {detail.location.public_email}
                        </a>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            {(detail.location.public_parking_notes.length > 0 || detail.location.public_transit_notes.length > 0) ? (
              <section className="grid gap-6 border-b border-slate-200 pb-8 md:grid-cols-2">
                {detail.location.public_parking_notes.length > 0 ? (
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Parking</h2>
                    <div className="mt-4 grid gap-3">
                      {detail.location.public_parking_notes.map((item) => (
                        <div key={item} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {detail.location.public_transit_notes.length > 0 ? (
                  <div>
                    <h2 className="text-2xl font-semibold text-slate-900">Transit</h2>
                    <div className="mt-4 grid gap-3">
                      {detail.location.public_transit_notes.map((item) => (
                        <div key={item} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                          <MapPin className="mt-0.5 h-4 w-4 text-slate-400" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            {detail.location.public_included_items.length > 0 ? (
              <section className="border-b border-slate-200 pb-8">
                <h2 className="text-2xl font-semibold text-slate-900">Included With Your Reservation</h2>
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  {detail.location.public_included_items.map((item) => (
                    <div key={item} className="flex items-start gap-3 rounded-[20px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-teal-600" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.support_contacts.length > 0 ? (
              <section>
                <h2 className="text-2xl font-semibold text-slate-900">We&apos;re Here To Help</h2>
                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {detail.support_contacts.map((contact) => (
                    <div key={`${contact.name}-${contact.title}`} className="flex items-center gap-4 rounded-[24px] border border-slate-200 bg-white px-5 py-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,_#c7f9cc,_#e2e8f0)] text-sm font-semibold text-slate-900">
                        {buildInitials(contact.name)}
                      </div>
                      <div>
                        <div className="text-base font-semibold text-slate-900">{contact.name}</div>
                        <div className="text-sm text-slate-500">{contact.title}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}
          </div>

          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_24px_60px_-36px_rgba(15,23,42,0.45)]">
              {detail.cancellation_policy ? (
                <div className="rounded-[20px] border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                  <div className="flex items-center gap-2 font-semibold">
                    <ShieldCheck className="h-4 w-4" />
                    Book with confidence
                  </div>
                  <p className="mt-2 leading-6 text-teal-800">
                    Cancel up to {detail.cancellation_policy.cancel_window_hours} hours before start time for a{" "}
                    {detail.cancellation_policy.refund_percent}% refund.
                  </p>
                </div>
              ) : null}

              <div className="rounded-[24px] border border-slate-200 p-5">
                <div className="text-center text-3xl font-semibold text-slate-900">{primaryPrice}</div>
                {priceRows.length > 1 ? (
                  <div className="mt-4 space-y-2 text-sm text-slate-600">
                    {priceRows.slice(1).map((row) => (
                      <div key={row.label} className="flex items-center justify-between gap-4">
                        <span>{row.label}</span>
                        <span className="font-medium text-slate-900">{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-3">
                  <label className="grid gap-2 text-sm font-medium text-slate-700">
                    <span className="inline-flex items-center gap-2">
                      <CalendarDays className="h-4 w-4 text-slate-500" />
                      Date
                    </span>
                    <input
                      type="date"
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                    />
                  </label>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-slate-500" />
                        Start time
                      </span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(event) => setStartTime(event.target.value)}
                        className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                      />
                    </label>
                    <label className="grid gap-2 text-sm font-medium text-slate-700">
                      <span className="inline-flex items-center gap-2">
                        <Clock3 className="h-4 w-4 text-slate-500" />
                        End time
                      </span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(event) => setEndTime(event.target.value)}
                        className="h-11 rounded-2xl border border-slate-200 bg-slate-50 px-4 text-sm text-slate-900 outline-none"
                      />
                    </label>
                  </div>

                  {error ? <div className="text-sm text-red-600">{error}</div> : null}

                  {!isAuthenticated ? (
                    <div className="rounded-[18px] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                      Browse freely now, then sign in when you&apos;re ready to reserve or start a membership.
                    </div>
                  ) : null}

                  <button
                    type="button"
                    onClick={handleReserve}
                    disabled={requesting}
                    className="inline-flex h-12 items-center justify-center rounded-full bg-slate-900 px-6 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {requesting ? "Reserving..." : isAuthenticated ? "Reserve" : "Sign in to reserve"}
                  </button>
                </div>
              </div>

              {plans.length > 0 ? (
                <div className="rounded-[24px] border border-slate-200 p-5">
                  <div className="text-sm font-semibold text-slate-900">Membership plans</div>
                  <div className="mt-4 grid gap-3">
                    {plans.map((plan) => (
                      <div key={plan.public_id} className="rounded-[20px] border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-sm font-semibold text-slate-900">{plan.name}</div>
                        <div className="mt-1 text-sm text-slate-600">
                          {plan.billing_cycle} • ${plan.price}
                        </div>
                        <button
                          type="button"
                          onClick={() => handleMembershipClick(plan)}
                          className="mt-3 inline-flex h-10 items-center justify-center rounded-full border border-slate-300 px-4 text-sm font-medium text-slate-700 transition hover:border-slate-900 hover:text-slate-900"
                        >
                          {isAuthenticated ? "Start membership" : "Sign in for membership"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </aside>
        </div>
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
            router.push("/customer/subscriptions");
          }}
        />
      ) : null}
    </main>
  );
}

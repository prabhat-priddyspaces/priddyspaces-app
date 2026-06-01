"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Mail,
  RefreshCw,
  Search,
  Send,
  UserPlus,
} from "lucide-react";

import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  DEFAULT_GRANULARITY_MINUTES,
  formatDateLong,
  formatTimeLabel,
  getDayOpenWindow,
  getOpenIntervalsForDay,
  todayIso,
  type OpenInterval,
} from "@/lib/space-availability";
import { cn } from "@/lib/utils";

type PaymentMode = "cash_collected" | "payment_link";
type MemberMode = "existing" | "new";
type BookingMode = "hourly" | "day_pass";

interface LocationOption {
  public_id: string;
  organization_public_id: string;
  name: string;
  city: string | null;
  timezone: string;
}

interface OrganizationOption {
  public_id: string;
  name: string;
}

interface SpaceOption {
  public_id: string;
  name: string;
  space_type: string;
  capacity: number;
  price_hourly: number | string | null;
  price_daily: number | string | null;
  availability_start_time: string | null;
  availability_end_time: string | null;
}

interface MemberOption {
  user_public_id: string;
  name: string;
  email: string;
  phone?: string | null;
  company_name?: string | null;
  status: string;
}

interface AvailabilityDay {
  date: string;
  fully_blocked: boolean;
  busy_intervals: Array<{ start: string; end: string }>;
}

interface AvailabilityResponse {
  space_public_id: string;
  timezone: string;
  granularity_minutes: number | null;
  availability_start_time: string | null;
  availability_end_time: string | null;
  days: AvailabilityDay[];
}

interface PreviewResponse {
  currency: string;
  base_amount_cents: number;
  discount_amount_cents: number;
  tax_amount_cents: number;
  total_amount_cents: number;
  original_total_amount_cents: number | null;
  override_applied: boolean;
  rate_basis: string | null;
  units: number | null;
  quantity: number;
}

interface BookingResult {
  request_public_id: string;
  booking_public_id: string | null;
  status: string;
  payment_status: string | null;
  payment_collection_mode: PaymentMode;
  member_public_id: string;
  member_email: string;
  member_name: string | null;
  total_amount_cents: number;
  payment_link_url: string | null;
  payment_link_expires_at: string | null;
  registration_url: string | null;
}

const today = todayIso();

function dollarsFromCents(cents: number | null | undefined): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format((cents || 0) / 100);
}

function toCurrencyInput(cents: number | null): string {
  if (cents == null) return "";
  return (cents / 100).toFixed(2);
}

function centsFromCurrency(value: string): number | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  const number = Number(cleaned);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number * 100);
}

function localIso(date: string, time: string): string {
  const dt = new Date(`${date}T${time}:00`);
  return dt.toISOString();
}

function modeLabel(value: string | null): string {
  if (!value) return "Standard rate";
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function describeOpenIntervals(intervals: OpenInterval[]): string {
  if (intervals.length === 0) return "No open slots for this date.";
  return intervals
    .map((interval) => `${formatTimeLabel(interval.start)} - ${formatTimeLabel(interval.end)}`)
    .join(", ");
}

export default function NewOwnerBookingPage() {
  const [organizations, setOrganizations] = useState<OrganizationOption[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [members, setMembers] = useState<MemberOption[]>([]);
  const [availability, setAvailability] = useState<AvailabilityResponse | null>(null);
  const [organizationId, setOrganizationId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [spaceId, setSpaceId] = useState("");
  const [bookingDate, setBookingDate] = useState(today);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [bookingMode, setBookingMode] = useState<BookingMode>("hourly");
  const [fullDay, setFullDay] = useState(false);
  const [seats, setSeats] = useState("1");
  const [memberMode, setMemberMode] = useState<MemberMode>("existing");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberPublicId, setMemberPublicId] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberPhone, setMemberPhone] = useState("");
  const [memberCompany, setMemberCompany] = useState("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash_collected");
  const [overrideAmount, setOverrideAmount] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [operatorNotes, setOperatorNotes] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [result, setResult] = useState<BookingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [membersLoading, setMembersLoading] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const token = getAccessToken() ?? undefined;
  const selectedLocation = locations.find((location) => location.public_id === locationId) || null;
  const selectedOrganizationPublicId = organizationId || selectedLocation?.organization_public_id || "";
  const selectedSpace = spaces.find((space) => space.public_id === spaceId) || null;
  const selectedAvailabilityDay = availability?.days.find((day) => day.date === bookingDate);
  const openWindow = getDayOpenWindow({
    availability_start_time:
      availability?.availability_start_time ?? selectedSpace?.availability_start_time ?? null,
    availability_end_time:
      availability?.availability_end_time ?? selectedSpace?.availability_end_time ?? null,
  });
  const openIntervals = getOpenIntervalsForDay(selectedAvailabilityDay, openWindow);
  const granularity = availability?.granularity_minutes ?? DEFAULT_GRANULARITY_MINUTES;

  const canSubmit = useMemo(() => {
    if (!spaceId || !bookingDate || !startTime || !endTime) return false;
    if (memberMode === "existing" && !memberPublicId) return false;
    if (memberMode === "new" && (!memberName.trim() || !memberEmail.trim())) return false;
    if (overrideAmount.trim() && !overrideReason.trim()) return false;
    return true;
  }, [
    bookingDate,
    endTime,
    memberEmail,
    memberMode,
    memberName,
    memberPublicId,
    overrideAmount,
    overrideReason,
    spaceId,
    startTime,
  ]);

  const buildPayload = useCallback(
    (includeMember: boolean) => {
      const overrideCents = centsFromCurrency(overrideAmount);
      const payload: Record<string, unknown> = {
        space_public_id: spaceId,
        start_datetime: localIso(bookingDate, startTime),
        end_datetime: localIso(bookingDate, endTime),
        booking_mode: bookingMode,
        full_day: fullDay,
        seats_requested: Math.max(1, Number.parseInt(seats, 10) || 1),
      };
      if (overrideCents != null) {
        payload.override_amount_cents = overrideCents;
        payload.override_reason = overrideReason.trim();
      }
      if (includeMember) {
        payload.payment_collection_mode = paymentMode;
        payload.operator_notes = operatorNotes.trim() || null;
        if (memberMode === "existing") {
          payload.member_public_id = memberPublicId;
        } else {
          payload.member = {
            email: memberEmail.trim(),
            full_name: memberName.trim(),
            phone: memberPhone.trim() || null,
            company_name: memberCompany.trim() || null,
          };
        }
      }
      return payload;
    },
    [
      bookingDate,
      bookingMode,
      endTime,
      fullDay,
      memberCompany,
      memberEmail,
      memberMode,
      memberName,
      memberPhone,
      memberPublicId,
      operatorNotes,
      overrideAmount,
      overrideReason,
      paymentMode,
      seats,
      spaceId,
      startTime,
    ],
  );

  useEffect(() => {
    let active = true;
    if (!token) {
      setLoading(false);
      setMessage("Sign in as an owner to create a booking.");
      return;
    }
    setLoading(true);
    apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token)
      .then((rows) => {
        if (!active) return;
        setOrganizations(rows);
        setOrganizationId((current) => current || rows[0]?.public_id || "");
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Failed to load organizations");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token]);

  useEffect(() => {
    if (!token || !organizationId) {
      setLocations([]);
      setLocationId("");
      return;
    }
    let active = true;
    setLoading(true);
    apiFetch<LocationOption[]>(
      `/api/locations?organization_public_id=${encodeURIComponent(organizationId)}`,
      { method: "GET" },
      token,
    )
      .then((rows) => {
        if (!active) return;
        setLocations(rows);
        setLocationId((current) => (rows.some((row) => row.public_id === current) ? current : rows[0]?.public_id || ""));
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Failed to load locations");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [organizationId, token]);

  useEffect(() => {
    if (!token || !locationId) {
      setSpaces([]);
      setSpaceId("");
      return;
    }
    let active = true;
    apiFetch<SpaceOption[]>(
      `/api/locations/${encodeURIComponent(locationId)}/spaces`,
      { method: "GET" },
      token,
    )
      .then((rows) => {
        if (!active) return;
        setSpaces(rows);
        setSpaceId(rows[0]?.public_id || "");
      })
      .catch((err) => {
        if (active) setMessage(err instanceof Error ? err.message : "Failed to load spaces");
      });
    return () => {
      active = false;
    };
  }, [locationId, token]);

  useEffect(() => {
    if (!token || !spaceId || !bookingDate) {
      setAvailability(null);
      return;
    }
    let active = true;
    apiFetch<AvailabilityResponse>(
      `/api/owner/spaces/${encodeURIComponent(spaceId)}/availability?from=${bookingDate}&to=${bookingDate}`,
      { method: "GET" },
      token,
    )
      .then((resp) => {
        if (active) setAvailability(resp);
      })
      .catch(() => {
        if (active) setAvailability(null);
      });
    return () => {
      active = false;
    };
  }, [bookingDate, spaceId, token]);

  useEffect(() => {
    if (!token || memberMode !== "existing") return;
    if (!selectedOrganizationPublicId) {
      setMembers([]);
      setMemberPublicId("");
      return;
    }
    const trimmed = memberSearch.trim();
    if (trimmed.length < 2) {
      setMembers([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(() => {
      setMembersLoading(true);
      const params = new URLSearchParams({
        organization_public_id: selectedOrganizationPublicId,
        search: trimmed,
      });
      apiFetch<MemberOption[]>(
        `/api/owner/members?${params.toString()}`,
        { method: "GET" },
        token,
      )
        .then((rows) => {
          if (!active) return;
          setMembers(rows);
          setMessage("");
        })
        .catch((err) => {
          if (active) setMessage(err instanceof Error ? err.message : "Failed to search members");
        })
        .finally(() => {
          if (active) setMembersLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [memberMode, memberSearch, selectedOrganizationPublicId, token]);

  async function handlePreview() {
    if (!token) return;
    setPreviewing(true);
    setMessage("");
    setPreview(null);
    try {
      const resp = await apiFetch<PreviewResponse>(
        "/api/owner/bookings/preview",
        {
          method: "POST",
          body: JSON.stringify(buildPayload(false)),
        },
        token,
      );
      setPreview(resp);
      setOverrideAmount(toCurrencyInput(resp.override_applied ? resp.total_amount_cents : null));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to preview booking");
    } finally {
      setPreviewing(false);
    }
  }

  async function handleCreate() {
    if (!token || !canSubmit) return;
    setSubmitting(true);
    setMessage("");
    setResult(null);
    try {
      const resp = await apiFetch<BookingResult>(
        "/api/owner/bookings",
        {
          method: "POST",
          body: JSON.stringify(buildPayload(true)),
        },
        token,
      );
      setResult(resp);
      setPreview(null);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to create booking");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AppShell title="Create booking" breadcrumb={["Owner", "Operations"]}>
      <div className="grid gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[13px] text-text-3">
              Create a confirmed cash booking or send a hosted payment link for a member.
            </p>
          </div>
          <Link href="/owner/calendar">
            <Button type="button" variant="ghost" size="sm">
              <CalendarDays size={14} />
              Calendar
            </Button>
          </Link>
        </div>

        {message ? (
          <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] text-danger">
            {message}
          </div>
        ) : null}

        {result ? (
          <Card className="border-success/30 bg-success-soft">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-[14px] font-semibold text-success">
                  <CheckCircle2 size={16} />
                  {result.payment_collection_mode === "cash_collected"
                    ? "Cash booking confirmed"
                    : "Payment link sent"}
                </div>
                <div className="mt-1 text-[13px] text-text-2">
                  {result.member_name || result.member_email} · {dollarsFromCents(result.total_amount_cents)}
                </div>
                <div className="mt-1 text-[12px] text-text-3">
                  Request {result.request_public_id}
                  {result.booking_public_id ? ` · Booking ${result.booking_public_id}` : ""}
                </div>
                {result.payment_link_expires_at ? (
                  <div className="mt-1 text-[12px] text-text-3">
                    Hold expires {new Date(result.payment_link_expires_at).toLocaleString()}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                {result.payment_link_url ? (
                  <a href={result.payment_link_url} target="_blank" rel="noreferrer">
                    <Button type="button" size="sm" variant="primary">
                      <CreditCard size={14} />
                      Open link
                    </Button>
                  </a>
                ) : null}
                {result.registration_url ? (
                  <a href={result.registration_url} target="_blank" rel="noreferrer">
                    <Button type="button" size="sm" variant="default">
                      <UserPlus size={14} />
                      Registration
                    </Button>
                  </a>
                ) : null}
              </div>
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.6fr)]">
          <div className="grid gap-4">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <CalendarDays size={16} className="text-brand" />
                <h2 className="text-[15px] font-semibold text-text">Space and time</h2>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {organizations.length > 1 ? (
                  <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                    Organization
                    <select
                      value={organizationId}
                      onChange={(event) => {
                        setOrganizationId(event.target.value);
                        setLocationId("");
                        setSpaceId("");
                        setMembers([]);
                        setMemberPublicId("");
                        setMemberSearch("");
                        setPreview(null);
                        setResult(null);
                      }}
                      className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-brand"
                      data-testid="owner-booking-organization"
                    >
                      {organizations.map((organization) => (
                        <option key={organization.public_id} value={organization.public_id}>
                          {organization.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Location
                  <select
                    value={locationId}
                    onChange={(event) => {
                      setLocationId(event.target.value);
                      setMemberPublicId("");
                      setMemberSearch("");
                      setMembers([]);
                      setPreview(null);
                      setResult(null);
                    }}
                    className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-brand"
                    disabled={!selectedOrganizationPublicId}
                    data-testid="owner-booking-location"
                  >
                    <option value="">Select location</option>
                    {locations.map((location) => (
                      <option key={location.public_id} value={location.public_id}>
                        {location.name}{location.city ? `, ${location.city}` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Space
                  <select
                    value={spaceId}
                    onChange={(event) => setSpaceId(event.target.value)}
                    className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-brand"
                    data-testid="owner-booking-space"
                  >
                    <option value="">Select space</option>
                    {spaces.map((space) => (
                      <option key={space.public_id} value={space.public_id}>
                        {space.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Date
                  <Input
                    type="date"
                    min={today}
                    value={bookingDate}
                    onChange={(event) => setBookingDate(event.target.value)}
                    data-testid="owner-booking-date"
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Booking mode
                  <select
                    value={bookingMode}
                    onChange={(event) => setBookingMode(event.target.value as BookingMode)}
                    className="h-9 rounded-xl border border-line-strong bg-surface px-3 text-[13px] outline-none focus:border-brand"
                    data-testid="owner-booking-mode"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="day_pass">Day pass</option>
                  </select>
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Start
                  <Input
                    type="time"
                    value={startTime}
                    onChange={(event) => setStartTime(event.target.value)}
                    data-testid="owner-booking-start"
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  End
                  <Input
                    type="time"
                    value={endTime}
                    onChange={(event) => setEndTime(event.target.value)}
                    data-testid="owner-booking-end"
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Seats
                  <Input
                    type="number"
                    min={1}
                    value={seats}
                    onChange={(event) => setSeats(event.target.value)}
                    data-testid="owner-booking-seats"
                  />
                </label>
                <label className="flex items-center gap-2 pt-6 text-[13px] text-text-2">
                  <input
                    type="checkbox"
                    checked={fullDay}
                    onChange={(event) => setFullDay(event.target.checked)}
                    className="h-4 w-4"
                    data-testid="owner-booking-full-day"
                  />
                  Full-day booking
                </label>
              </div>
              <div className="mt-3 rounded-xl border border-line bg-surface-2 px-3 py-2 text-[12px] text-text-3">
                {availability ? (
                  <>
                    <span className="font-semibold text-text">{formatDateLong(bookingDate)}:</span>{" "}
                    {describeOpenIntervals(openIntervals)}
                    {selectedLocation?.timezone ? ` · ${selectedLocation.timezone}` : ""}
                    {granularity ? ` · ${granularity} min slots` : ""}
                  </>
                ) : selectedSpace ? (
                  "Availability will appear after the space is selected."
                ) : loading ? (
                  "Loading owner locations..."
                ) : (
                  "Select a location and space to load availability."
                )}
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center gap-2">
                <UserPlus size={16} className="text-brand" />
                <h2 className="text-[15px] font-semibold text-text">Member</h2>
              </div>
              <div className="mb-4 inline-flex rounded-xl border border-line bg-surface-2 p-1">
                {(["existing", "new"] as MemberMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => {
                      setMemberMode(mode);
                      setMemberPublicId("");
                    }}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-[12px] font-semibold",
                      memberMode === mode ? "bg-surface text-text shadow-xs" : "text-text-3",
                    )}
                    data-testid={`owner-booking-member-${mode}`}
                  >
                    {mode === "existing" ? "Existing member" : "New member"}
                  </button>
                ))}
              </div>

              {memberMode === "existing" ? (
                <div className="grid gap-3">
                  <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                    Search members
                    <div className="relative">
                      <Search size={14} className="pointer-events-none absolute left-3 top-2.5 text-text-4" />
                      <Input
                        value={memberSearch}
                        onChange={(event) => setMemberSearch(event.target.value)}
                        placeholder={
                          selectedOrganizationPublicId
                            ? "Search by name, email, or company"
                            : "Select a location first"
                        }
                        className="pl-9"
                        disabled={!selectedOrganizationPublicId}
                        data-testid="owner-booking-member-search"
                      />
                    </div>
                  </label>
                  <div className="grid gap-2">
                    {membersLoading ? (
                      <div className="text-[12px] text-text-3">Searching members...</div>
                    ) : !selectedOrganizationPublicId ? (
                      <div className="text-[12px] text-text-3">Select a location before searching members.</div>
                    ) : members.length === 0 ? (
                      <div className="text-[12px] text-text-3">Type at least two characters to find a member.</div>
                    ) : (
                      members.map((member) => {
                        const active = memberPublicId === member.user_public_id;
                        return (
                          <button
                            key={member.user_public_id}
                            type="button"
                            onClick={() => setMemberPublicId(member.user_public_id)}
                            className={cn(
                              "rounded-xl border px-3 py-2 text-left text-[13px]",
                              active
                                ? "border-brand bg-brand-soft text-text"
                                : "border-line bg-surface hover:border-brand/50",
                            )}
                            data-testid={`owner-booking-member-option-${member.user_public_id}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{member.name || member.email}</span>
                              <Badge variant={active ? "info" : "default"}>{member.status}</Badge>
                            </div>
                            <div className="mt-0.5 text-[12px] text-text-3">
                              {member.email}
                              {member.company_name ? ` · ${member.company_name}` : ""}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                    Full name
                    <Input
                      value={memberName}
                      onChange={(event) => setMemberName(event.target.value)}
                      placeholder="Member name"
                      data-testid="owner-booking-new-name"
                    />
                  </label>
                  <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                    Email
                    <Input
                      type="email"
                      value={memberEmail}
                      onChange={(event) => setMemberEmail(event.target.value)}
                      placeholder="member@example.com"
                      data-testid="owner-booking-new-email"
                    />
                  </label>
                  <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                    Phone
                    <Input
                      value={memberPhone}
                      onChange={(event) => setMemberPhone(event.target.value)}
                      placeholder="Optional"
                      data-testid="owner-booking-new-phone"
                    />
                  </label>
                  <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                    Company
                    <Input
                      value={memberCompany}
                      onChange={(event) => setMemberCompany(event.target.value)}
                      placeholder="Optional"
                      data-testid="owner-booking-new-company"
                    />
                  </label>
                </div>
              )}
            </Card>
          </div>

          <div className="grid gap-4 content-start">
            <Card>
              <div className="mb-4 flex items-center gap-2">
                <DollarSign size={16} className="text-brand" />
                <h2 className="text-[15px] font-semibold text-text">Payment</h2>
              </div>
              <div className="grid gap-2">
                <button
                  type="button"
                  onClick={() => setPaymentMode("cash_collected")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-3 py-3 text-left",
                    paymentMode === "cash_collected" ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  )}
                  data-testid="owner-booking-payment-cash"
                >
                  <DollarSign size={16} className="mt-0.5 text-brand" />
                  <span>
                    <span className="block text-[13px] font-semibold text-text">Cash collected</span>
                    <span className="block text-[12px] text-text-3">
                      Confirm the booking and record a succeeded cash payment.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMode("payment_link")}
                  className={cn(
                    "flex items-start gap-3 rounded-xl border px-3 py-3 text-left",
                    paymentMode === "payment_link" ? "border-brand bg-brand-soft" : "border-line bg-surface",
                  )}
                  data-testid="owner-booking-payment-link"
                >
                  <Send size={16} className="mt-0.5 text-brand" />
                  <span>
                    <span className="block text-[13px] font-semibold text-text">Send payment link</span>
                    <span className="block text-[12px] text-text-3">
                      Email a Priddyspaces-hosted link and hold the booking until it expires.
                    </span>
                  </span>
                </button>
              </div>

              <div className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Override amount
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={overrideAmount}
                    onChange={(event) => setOverrideAmount(event.target.value)}
                    placeholder="Optional"
                    data-testid="owner-booking-override-amount"
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Override reason
                  <Input
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    placeholder="Required when amount is overridden"
                    data-testid="owner-booking-override-reason"
                  />
                </label>
                <label className="grid gap-1.5 text-[12px] font-medium text-text-2">
                  Operator notes
                  <textarea
                    value={operatorNotes}
                    onChange={(event) => setOperatorNotes(event.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[13px] text-text outline-none transition focus:border-brand focus-visible:shadow-ring"
                    placeholder="Internal notes for the booking"
                    data-testid="owner-booking-notes"
                  />
                </label>
              </div>
            </Card>

            <Card>
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[15px] font-semibold text-text">Summary</h2>
                  <p className="text-[12px] text-text-3">
                    Preview validates inventory before you create the booking.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="default"
                  onClick={handlePreview}
                  disabled={!spaceId || previewing}
                  data-testid="owner-booking-preview-button"
                >
                  <RefreshCw size={13} />
                  {previewing ? "Previewing" : "Preview"}
                </Button>
              </div>

              {preview ? (
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-3">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-text-3">Base</span>
                    <span className="font-mono font-semibold">{dollarsFromCents(preview.base_amount_cents)}</span>
                  </div>
                  {preview.discount_amount_cents ? (
                    <div className="mt-1 flex items-center justify-between text-[13px]">
                      <span className="text-text-3">Discount</span>
                      <span className="font-mono font-semibold">-{dollarsFromCents(preview.discount_amount_cents)}</span>
                    </div>
                  ) : null}
                  {preview.tax_amount_cents ? (
                    <div className="mt-1 flex items-center justify-between text-[13px]">
                      <span className="text-text-3">Tax</span>
                      <span className="font-mono font-semibold">{dollarsFromCents(preview.tax_amount_cents)}</span>
                    </div>
                  ) : null}
                  <div className="mt-3 border-t border-line pt-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[13px] font-semibold text-text">Total</span>
                      <span className="font-mono text-[18px] font-semibold">{dollarsFromCents(preview.total_amount_cents)}</span>
                    </div>
                    <div className="mt-1 text-[12px] text-text-3">
                      {modeLabel(preview.rate_basis)}
                      {preview.units ? ` · ${preview.units} unit${preview.units === 1 ? "" : "s"}` : ""}
                      {preview.quantity > 1 ? ` · ${preview.quantity} seats` : ""}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-surface-2 px-3 py-6 text-center text-[13px] text-text-3">
                  No preview yet.
                </div>
              )}

              <Button
                type="button"
                variant="primary"
                className="mt-4 w-full"
                onClick={handleCreate}
                disabled={!canSubmit || submitting}
                data-testid="owner-booking-submit-button"
              >
                {paymentMode === "cash_collected" ? <CheckCircle2 size={15} /> : <Mail size={15} />}
                {submitting
                  ? "Creating..."
                  : paymentMode === "cash_collected"
                    ? "Confirm cash booking"
                    : "Send payment link"}
              </Button>
            </Card>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

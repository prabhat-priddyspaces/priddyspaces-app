"use client";

import { useEffect, useRef, useState } from "react";
import { Building2, KeyRound, Palette, Percent, ShieldCheck, User } from "lucide-react";

import { AdminShell } from "@/components/admin-shell";
import { ThemeFamilyPicker, ThemeModePicker } from "@/components/settings/appearance-controls";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatAdminDateTime } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";
import { fetchSpaceTypes, type SpaceTypeConfig } from "@/lib/space-types";

interface CurrentAdmin {
  public_id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  name: string;
  created_at: string | null;
  has_password: boolean;
}

interface SettingsResponse {
  default_owner_commission_pct: number;
  priddy_points_enabled: boolean;
  priddy_signup_points: number;
  priddy_point_value_cents: number;
  priddy_allowed_space_types: string[];
  priddy_allowed_booking_modes: string[];
  booking_calendar_daily_prices_enabled: boolean;
  current_admin: CurrentAdmin;
}

type Section = "platform" | "profile" | "password" | "appearance";

const SECTIONS: Array<{
  id: Section;
  group: string;
  label: string;
  icon: typeof Percent;
  superadmin: boolean;
}> = [
  { id: "platform", group: "Organization", label: "Platform defaults", icon: Percent, superadmin: true },
  { id: "profile", group: "Account", label: "Admin profile", icon: User, superadmin: false },
  { id: "password", group: "Account", label: "Password", icon: KeyRound, superadmin: false },
  { id: "appearance", group: "Account", label: "Appearance", icon: Palette, superadmin: false },
];

export default function AdminSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [commission, setCommission] = useState("0");
  const [priddyEnabled, setPriddyEnabled] = useState(true);
  const [priddySignupPoints, setPriddySignupPoints] = useState("1000");
  const [priddySpaceTypes, setPriddySpaceTypes] = useState<string[]>(["shared_desk"]);
  const [spaceTypeOptions, setSpaceTypeOptions] = useState<SpaceTypeConfig[]>([]);
  const [priddyBookingModes, setPriddyBookingModes] = useState<string[]>(["day_pass"]);
  const [calendarDailyPricesEnabled, setCalendarDailyPricesEnabled] = useState(false);
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "danger">("success");
  const [activeSection, setActiveSection] = useState<Section>("platform");
  const sectionRefs = useRef<Record<Section, HTMLDivElement | null>>({
    platform: null,
    profile: null,
    password: null,
    appearance: null,
  });

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then(setMe)
      .catch(() => null);
    fetchSpaceTypes(token).then(setSpaceTypeOptions).catch(() => null);
    apiFetch<SettingsResponse>("/api/admin/settings", { method: "GET" }, token)
      .then((settings) => {
        setCommission(String(settings.default_owner_commission_pct));
        setPriddyEnabled(settings.priddy_points_enabled);
        setPriddySignupPoints(String(settings.priddy_signup_points));
        setPriddySpaceTypes(settings.priddy_allowed_space_types || ["shared_desk"]);
        setPriddyBookingModes(settings.priddy_allowed_booking_modes || ["day_pass"]);
        setCalendarDailyPricesEnabled(settings.booking_calendar_daily_prices_enabled);
        setCurrentAdmin(settings.current_admin);
        setFirstName(settings.current_admin.first_name ?? "");
        setLastName(settings.current_admin.last_name ?? "");
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : "Failed to load settings");
        setMessageTone("danger");
      });
  }, []);

  function notify(text: string, tone: "success" | "danger" = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function saveSettings() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(
        "/api/admin/settings",
        {
          method: "PATCH",
          body: JSON.stringify({
            default_owner_commission_pct: Number(commission),
            priddy_points_enabled: priddyEnabled,
            priddy_signup_points: Number(priddySignupPoints || 0),
            priddy_point_value_cents: 1,
            priddy_allowed_space_types: priddySpaceTypes,
            priddy_allowed_booking_modes: priddyBookingModes,
            booking_calendar_daily_prices_enabled: calendarDailyPricesEnabled,
          }),
        },
        token
      );
      notify("Platform defaults saved.");
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "danger");
    }
  }

  async function saveProfile() {
    const token = getAccessToken() ?? undefined;
    try {
      const admin = await apiFetch<CurrentAdmin>(
        "/api/admin/settings/profile",
        {
          method: "PATCH",
          body: JSON.stringify({ first_name: firstName, last_name: lastName }),
        },
        token
      );
      setCurrentAdmin(admin);
      notify("Profile saved.");
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "danger");
    }
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      notify("New passwords do not match.", "danger");
      return;
    }
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(
        "/api/admin/settings/password",
        {
          method: "PATCH",
          body: JSON.stringify({
            current_password: currentAdmin?.has_password ? currentPassword : null,
            new_password: newPassword,
          }),
        },
        token
      );
      setCurrentAdmin((current) =>
        current ? { ...current, has_password: true } : current
      );
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      notify("Password updated.");
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "danger");
    }
  }

  const isSuperadmin = me?.platform_role === "superadmin";
  const visibleSections = SECTIONS.filter((s) => !s.superadmin || isSuperadmin);

  function scrollToSection(id: Section) {
    setActiveSection(id);
    const node = sectionRefs.current[id];
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function toggleList(current: string[], value: string, setter: (value: string[]) => void) {
    setter(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
  }

  // Group section nav by `group`.
  const navGroups = visibleSections.reduce<Record<string, typeof visibleSections>>(
    (acc, section) => {
      (acc[section.group] ??= []).push(section);
      return acc;
    },
    {}
  );

  return (
    <AdminShell title="Settings" breadcrumb={["Admin", "Platform"]}>
      <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Section nav */}
        <aside className="hidden lg:block sticky top-4 self-start">
          <nav className="flex flex-col gap-3">
            {Object.entries(navGroups).map(([group, items]) => (
              <div key={group}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-4 px-2.5 mb-1">
                  {group}
                </div>
                {items.map((item) => {
                  const active = activeSection === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => scrollToSection(item.id)}
                      className={cn(
                        "flex items-center gap-2.5 w-full rounded-lg px-2.5 py-1.5 text-left text-[13px] transition-colors",
                        active
                          ? "bg-brand-soft text-brand-strong font-semibold"
                          : "text-text-2 font-medium hover:bg-surface-2"
                      )}
                    >
                      <Icon
                        size={15}
                        strokeWidth={1.6}
                        className={active ? "text-brand" : "text-text-3"}
                      />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>
        </aside>

        <div className="space-y-5">
          {message ? (
            <div
              className={cn(
                "rounded-2xl border px-4 py-3 text-[13px]",
                messageTone === "danger"
                  ? "border-danger/30 bg-danger-soft text-danger"
                  : "border-success/30 bg-success-soft text-success"
              )}
            >
              {message}
            </div>
          ) : null}

          {isSuperadmin ? (
            <div
              ref={(node) => {
                sectionRefs.current.platform = node;
              }}
            >
              <SectionHeader
                eyebrow="Organization"
                title="Platform defaults"
                sub="Defaults applied when new owner companies onboard."
              />
              <Card padded={false} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-[10px] bg-brand-soft text-brand grid place-items-center flex-none">
                      <Percent size={16} />
                    </div>
                    <div>
                      <div className="text-[14px] font-semibold">
                        Owner commission default
                      </div>
                      <div className="text-[12px] text-text-3">
                        Percentage Priddyspaces takes from each completed booking.
                      </div>
                    </div>
                  </div>
                  <Badge variant="violet">Superadmin</Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
                  <Field label="Commission (%)" hint="Use a number between 0 and 100.">
                    <div className="relative">
                      <Input
                        value={commission}
                        onChange={(e) => setCommission(e.target.value)}
                        placeholder="0"
                        className="pr-7"
                      />
                      <span
                        aria-hidden
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-text-3 font-mono"
                      >
                        %
                      </span>
                    </div>
                  </Field>
                  <Button
                    variant="primary"
                    onClick={() => void saveSettings()}
                  >
                    Save defaults
                  </Button>
                </div>
                <div className="mt-5 border-t border-border pt-5">
                  <div className="mb-5 rounded-xl border border-border p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-[13px] font-semibold">Booking calendar prices</div>
                        <div className="mt-1 text-[12px] text-text-3">
                          Show the current booking price under each available day in public calendar date pickers.
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-[13px] text-text-2">
                        <input
                          data-testid="booking-calendar-daily-prices-toggle"
                          type="checkbox"
                          checked={calendarDailyPricesEnabled}
                          onChange={(event) => setCalendarDailyPricesEnabled(event.target.checked)}
                        />
                        Enabled
                      </label>
                    </div>
                  </div>
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[14px] font-semibold">Priddy Points</div>
                      <div className="text-[12px] text-text-3">
                        Member signup grant and platform eligibility for point redemption.
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-[13px] text-text-2">
                      <input
                        type="checkbox"
                        checked={priddyEnabled}
                        onChange={(event) => setPriddyEnabled(event.target.checked)}
                      />
                      Enabled
                    </label>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="Signup points" hint="Applies only to future member registrations.">
                      <Input
                        value={priddySignupPoints}
                        onChange={(e) => setPriddySignupPoints(e.target.value)}
                        placeholder="1000"
                      />
                    </Field>
                    <Field label="Point value">
                      <Input value="1 cent" readOnly />
                    </Field>
                  </div>
                  <div className="mt-4 grid gap-4 md:grid-cols-2">
                    <Checklist
                      title="Eligible space types"
                      options={
                        (spaceTypeOptions.length
                          ? spaceTypeOptions
                          : []
                        ).map((type) => [type.key, type.label] as [string, string])
                      }
                      selected={priddySpaceTypes}
                      onToggle={(value) => toggleList(priddySpaceTypes, value, setPriddySpaceTypes)}
                    />
                    <Checklist
                      title="Eligible booking types"
                      options={[
                        ["day_pass", "Day pass"],
                        ["hourly", "Hourly"],
                      ]}
                      selected={priddyBookingModes}
                      onToggle={(value) => toggleList(priddyBookingModes, value, setPriddyBookingModes)}
                    />
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <Card padded={false} className="p-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-[10px] bg-surface-2 text-text-3 grid place-items-center flex-none">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold">
                    Read-only access
                  </div>
                  <div className="text-[12px] text-text-3">
                    Only superadmins can change platform defaults.
                  </div>
                </div>
              </div>
            </Card>
          )}

          {currentAdmin ? (
            <div
              ref={(node) => {
                sectionRefs.current.profile = node;
              }}
            >
              <SectionHeader
                eyebrow="Account"
                title="Admin profile"
                sub={
                  <>
                    {currentAdmin.email}
                    {" · "}
                    <span
                      className="font-mono"
                      style={{ fontVariantNumeric: "tabular-nums" }}
                    >
                      Created {formatAdminDateTime(currentAdmin.created_at)}
                    </span>
                  </>
                }
              />
              <Card padded={false} className="p-5">
                <div className="flex items-start gap-4 mb-4">
                  <Avatar
                    name={currentAdmin.name || currentAdmin.email}
                    size={48}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold tracking-[-0.01em]">
                      {currentAdmin.name || currentAdmin.email}
                    </div>
                    <div className="text-[12px] text-text-3 truncate">
                      {currentAdmin.email}
                    </div>
                  </div>
                  {me?.platform_role ? (
                    <Badge variant="violet">{me.platform_role}</Badge>
                  ) : null}
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="First name">
                    <Input
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First name"
                    />
                  </Field>
                  <Field label="Last name">
                    <Input
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last name"
                    />
                  </Field>
                </div>
                <div className="flex justify-end mt-4">
                  <Button variant="primary" onClick={() => void saveProfile()}>
                    Save profile
                  </Button>
                </div>
              </Card>
            </div>
          ) : null}

          {currentAdmin ? (
            <div
              ref={(node) => {
                sectionRefs.current.password = node;
              }}
            >
              <SectionHeader
                eyebrow="Account"
                title="Password"
                sub={
                  currentAdmin.has_password
                    ? "Change your current password."
                    : "Set a password for this admin account."
                }
              />
              <Card padded={false} className="p-5">
                <div className="grid gap-3 md:grid-cols-3">
                  {currentAdmin.has_password ? (
                    <Field label="Current password">
                      <Input
                        type="password"
                        value={currentPassword}
                        onChange={(e) => setCurrentPassword(e.target.value)}
                        placeholder="Current password"
                        autoComplete="current-password"
                      />
                    </Field>
                  ) : null}
                  <Field label="New password">
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      autoComplete="new-password"
                    />
                  </Field>
                  <Field label="Confirm password">
                    <Input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                    />
                  </Field>
                </div>
                <div className="flex justify-end mt-4">
                  <Button variant="primary" onClick={() => void changePassword()}>
                    Update password
                  </Button>
                </div>
              </Card>
            </div>
          ) : null}

          <div
            ref={(node) => {
              sectionRefs.current.appearance = node;
            }}
          >
            <SectionHeader
              eyebrow="Account"
              title="Appearance"
              sub="Choose your theme and light or dark mode. Personal to your account and applies across every page."
            />
            <Card padded={false} className="p-5">
              <div className="grid gap-5">
                <div>
                  <div className="text-[13px] font-semibold mb-2.5">Theme</div>
                  <ThemeFamilyPicker />
                </div>
                <div className="border-t border-border pt-5">
                  <div className="text-[13px] font-semibold mb-2.5">Appearance mode</div>
                  <ThemeModePicker />
                </div>
              </div>
            </Card>
          </div>

          {/* Suppress unused import warning */}
          <Building2 className="hidden" aria-hidden />
        </div>
      </div>
    </AdminShell>
  );
}

function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub?: React.ReactNode;
}) {
  return (
    <div className="mb-3">
      <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-text-3 mb-0.5">
        {eyebrow}
      </div>
      <div className="text-[19px] font-semibold tracking-[-0.02em]">
        {title}
      </div>
      {sub ? <div className="text-[12px] text-text-3 mt-0.5">{sub}</div> : null}
    </div>
  );
}

function Checklist({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<[string, string]>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="rounded-xl border border-border p-3">
      <div className="text-[13px] font-semibold">{title}</div>
      <div className="mt-3 grid gap-2">
        {options.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-[13px] text-text-2">
            <input type="checkbox" checked={selected.includes(value)} onChange={() => onToggle(value)} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

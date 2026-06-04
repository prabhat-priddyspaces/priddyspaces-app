"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { sanitizePhone } from "@/lib/phone";
import { Toggle } from "@/components/ui/toggle";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { MeResponse } from "@/lib/me";
import {
  NotificationPreference,
  getNotificationPreferences,
  registerBrowserPush,
  updateNotificationPreferences,
} from "@/lib/notifications";

export default function MemberProfilePage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<NotificationPreference | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [companyName, setCompanyName] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token)
      .then((data) => {
        setMe(data);
        setFirstName(data.first_name || "");
        setLastName(data.last_name || "");
        setPhone(data.phone || "");
        setCompanyName(data.company_name || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load profile"));
    getNotificationPreferences(token)
      .then(setPreferences)
      .catch(() => null);
  }, []);

  async function save() {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const updated = await apiFetch<MeResponse>(
        "/api/me",
        {
          method: "PATCH",
          body: JSON.stringify({
            first_name: firstName,
            last_name: lastName,
            phone,
            company_name: companyName,
          }),
        },
        token
      );
      setMe(updated);
      setMessage("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function updatePreference(field: keyof NotificationPreference, value: boolean) {
    const token = getAccessToken() ?? undefined;
    if (!token || !preferences) return;
    const next = { ...preferences, [field]: value };
    setPreferences(next);
    setPushMessage(null);
    try {
      const saved = await updateNotificationPreferences({ [field]: value }, token);
      setPreferences(saved);
      setPushMessage("Notification settings saved");
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : "Failed to save notification settings");
      const current = await getNotificationPreferences(token);
      setPreferences(current);
    }
  }

  async function enableBrowserNotifications() {
    const token = getAccessToken() ?? undefined;
    try {
      const result = await registerBrowserPush(token);
      setPushMessage(result.message);
    } catch (err) {
      setPushMessage(err instanceof Error ? err.message : "Unable to enable browser notifications");
    }
  }

  if (!me) {
    return <div className="text-sm text-textMuted">{error || "Loading…"}</div>;
  }

  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-2xl font-semibold text-textPrimary">My Profile</h2>
        <p className="text-textSecondary">
          Your name, phone, and company. These appear to coworking owners when you book.
        </p>
      </div>

      {error ? <div className="text-sm text-error">{error}</div> : null}

      <Card className="p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs text-textMuted">
            Email
            <Input value={me.email} disabled />
          </label>
          <label className="grid gap-1 text-xs text-textMuted">
            Phone
            <Input
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(sanitizePhone(e.target.value))}
              placeholder="5551234567"
            />
          </label>
          <label className="grid gap-1 text-xs text-textMuted">
            First name
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-textMuted">
            Last name
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </label>
          <label className="grid gap-1 text-xs text-textMuted sm:col-span-2">
            Company name
            <Input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </Button>
          {message ? <span className="text-sm text-success">{message}</span> : null}
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold text-textPrimary">Booking reminder notifications</div>
        <p className="mt-1 text-sm text-textSecondary">
          Receive push reminders 10 minutes before bookings start and before meeting-room bookings end.
        </p>
        <div className="mt-4 grid gap-3">
          <label className="flex items-center justify-between gap-3 text-sm text-textPrimary">
            <span>Before booking starts</span>
            <Toggle
              checked={preferences?.booking_start_push_enabled ?? true}
              onCheckedChange={(value) => void updatePreference("booking_start_push_enabled", value)}
              aria-label="Before booking starts"
            />
          </label>
          <label className="flex items-center justify-between gap-3 text-sm text-textPrimary">
            <span>Before meeting-room booking ends</span>
            <Toggle
              checked={preferences?.booking_end_push_enabled ?? true}
              onCheckedChange={(value) => void updatePreference("booking_end_push_enabled", value)}
              aria-label="Before meeting-room booking ends"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" onClick={enableBrowserNotifications}>
            Enable browser push
          </Button>
          {pushMessage ? <span className="text-sm text-textSecondary">{pushMessage}</span> : null}
        </div>
      </Card>
    </div>
  );
}

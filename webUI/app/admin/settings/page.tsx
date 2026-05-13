"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatAdminDateTime } from "@/lib/admin-format";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

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
  current_admin: CurrentAdmin;
}

export default function AdminSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [commission, setCommission] = useState("0");
  const [currentAdmin, setCurrentAdmin] = useState<CurrentAdmin | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token).then(setMe).catch(() => null);
    apiFetch<SettingsResponse>("/api/admin/settings", { method: "GET" }, token)
      .then((settings) => {
        setCommission(String(settings.default_owner_commission_pct));
        setCurrentAdmin(settings.current_admin);
        setFirstName(settings.current_admin.first_name ?? "");
        setLastName(settings.current_admin.last_name ?? "");
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load settings"));
  }, []);

  async function saveSettings() {
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      "/api/admin/settings",
      {
        method: "PATCH",
        body: JSON.stringify({ default_owner_commission_pct: Number(commission) }),
      },
      token
    );
    setMessage("Settings saved");
  }

  async function saveProfile() {
    const token = getAccessToken() ?? undefined;
    const admin = await apiFetch<CurrentAdmin>(
      "/api/admin/settings/profile",
      {
        method: "PATCH",
        body: JSON.stringify({ first_name: firstName, last_name: lastName }),
      },
      token
    );
    setCurrentAdmin(admin);
    setMessage("Profile saved");
  }

  async function changePassword() {
    if (newPassword !== confirmPassword) {
      setMessage("New passwords do not match");
      return;
    }
    const token = getAccessToken() ?? undefined;
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
    setCurrentAdmin((current) => (current ? { ...current, has_password: true } : current));
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setMessage("Password updated");
  }

  const isSuperadmin = me?.platform_role === "superadmin";

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Settings</h2>
          <p className="text-textSecondary">Global platform settings for owner commission defaults.</p>
        </div>
        <Card className="p-4">
          {!isSuperadmin ? (
            <div className="text-sm text-textMuted">Only superadmins can change platform settings.</div>
          ) : (
            <div className="space-y-3">
              <div className="text-sm font-semibold text-textPrimary">Owner commission default</div>
              <div className="flex gap-3">
                <Input value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0" />
                <Button type="button" onClick={() => saveSettings().catch((err) => setMessage(String(err)))}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </Card>
        {isSuperadmin && currentAdmin ? (
          <Card className="p-4">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-textPrimary">Admin profile</div>
                <div className="mt-1 text-sm text-textMuted">
                  {currentAdmin.email} • Created {formatAdminDateTime(currentAdmin.created_at)}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
              </div>
              <Button type="button" variant="secondary" onClick={() => saveProfile().catch((err) => setMessage(String(err)))}>
                Save profile
              </Button>
            </div>
          </Card>
        ) : null}
        {isSuperadmin && currentAdmin ? (
          <Card className="p-4">
            <div className="space-y-4">
              <div>
                <div className="text-sm font-semibold text-textPrimary">Password</div>
                <div className="mt-1 text-sm text-textMuted">
                  {currentAdmin.has_password ? "Change your current password." : "Set a password for this admin account."}
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                {currentAdmin.has_password ? (
                  <Input
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Current password"
                  />
                ) : null}
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirm password"
                />
              </div>
              <Button type="button" variant="secondary" onClick={() => changePassword().catch((err) => setMessage(String(err)))}>
                Change password
              </Button>
            </div>
          </Card>
        ) : null}
        {message ? <div className="text-sm text-textSecondary">{message}</div> : null}
      </div>
    </AdminShell>
  );
}

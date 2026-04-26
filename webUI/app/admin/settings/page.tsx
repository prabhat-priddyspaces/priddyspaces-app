"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

interface SettingsResponse {
  default_owner_commission_pct: number;
}

export default function AdminSettingsPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [commission, setCommission] = useState("0");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token).then(setMe).catch(() => null);
    apiFetch<SettingsResponse>("/api/admin/settings", { method: "GET" }, token)
      .then((settings) => setCommission(String(settings.default_owner_commission_pct)))
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
            <div className="flex gap-3">
              <Input value={commission} onChange={(e) => setCommission(e.target.value)} placeholder="0" />
              <Button type="button" onClick={() => saveSettings().catch((err) => setMessage(String(err)))}>
                Save
              </Button>
            </div>
          )}
        </Card>
        {message ? <div className="text-sm text-error">{message}</div> : null}
      </div>
    </AdminShell>
  );
}

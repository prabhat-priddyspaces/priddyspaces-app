"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { MeResponse } from "@/lib/me";

interface TeamMember {
  public_id: string;
  email: string;
  name: string;
  role: string;
  is_active: boolean;
}

export default function AdminPlatformTeamPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [message, setMessage] = useState("");

  async function loadMembers() {
    const token = getAccessToken() ?? undefined;
    const result = await apiFetch<TeamMember[]>("/api/admin/platform-team", { method: "GET" }, token);
    setMembers(result);
  }

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<MeResponse>("/api/me", { method: "GET" }, token).then(setMe).catch(() => null);
    loadMembers().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load platform team"));
  }, []);

  async function inviteMember() {
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      "/api/admin/platform-team",
      {
        method: "POST",
        body: JSON.stringify({ email, role }),
      },
      token
    );
    setEmail("");
    await loadMembers();
  }

  async function toggleMember(member: TeamMember) {
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/admin/platform-team/${member.public_id}`,
      {
        method: "PATCH",
        body: JSON.stringify({ is_active: !member.is_active }),
      },
      token
    );
    await loadMembers();
  }

  const isSuperadmin = me?.platform_role === "superadmin";

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Platform Team</h2>
          <p className="text-textSecondary">Invite and manage superadmin, admin, and support accounts.</p>
        </div>
        {!isSuperadmin ? (
          <Card className="p-4 text-sm text-textMuted">Only superadmins can manage platform team accounts.</Card>
        ) : (
          <>
            <Card className="p-4">
              <div className="grid gap-3 md:grid-cols-3">
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@example.com" />
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                >
                  <option value="support">Support</option>
                  <option value="admin">Admin</option>
                  <option value="superadmin">Superadmin</option>
                </select>
                <Button type="button" onClick={() => inviteMember().catch((err) => setMessage(String(err)))}>
                  Invite
                </Button>
              </div>
            </Card>
            {message ? <div className="text-sm text-error">{message}</div> : null}
            <div className="grid gap-3">
              {members.map((member) => (
                <Card key={member.public_id} className="p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold text-textPrimary">{member.name}</div>
                      <div className="text-sm text-textMuted">{member.email}</div>
                      <div className="text-sm text-textMuted">
                        {member.role} • {member.is_active ? "active" : "inactive"}
                      </div>
                    </div>
                    <Button type="button" variant="secondary" onClick={() => toggleMember(member).catch((err) => setMessage(String(err)))}>
                      {member.is_active ? "Deactivate" : "Activate"}
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

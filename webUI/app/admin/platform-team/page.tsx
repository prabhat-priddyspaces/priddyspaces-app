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
  first_name: string | null;
  last_name: string | null;
  role: string;
  is_active: boolean;
}

interface TeamDraft {
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
}

export default function AdminPlatformTeamPage() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TeamDraft>>({});
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("support");
  const [message, setMessage] = useState("");

  async function loadMembers() {
    const token = getAccessToken() ?? undefined;
    const result = await apiFetch<TeamMember[]>("/api/admin/platform-team", { method: "GET" }, token);
    setMembers(result);
    const nextDrafts: Record<string, TeamDraft> = {};
    result.forEach((member) => {
      nextDrafts[member.public_id] = {
        first_name: member.first_name ?? "",
        last_name: member.last_name ?? "",
        role: member.role,
        is_active: member.is_active,
      };
    });
    setDrafts(nextDrafts);
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

  async function updateMember(member: TeamMember) {
    const token = getAccessToken() ?? undefined;
    const draft = drafts[member.public_id];
    if (!draft) return;
    await apiFetch(
      `/api/admin/platform-team/${member.public_id}`,
      {
        method: "PATCH",
        body: JSON.stringify(draft),
      },
      token
    );
    await loadMembers();
  }

  async function removeMember(member: TeamMember) {
    const token = getAccessToken() ?? undefined;
    await apiFetch(
      `/api/admin/platform-team/${member.public_id}`,
      { method: "DELETE" },
      token
    );
    await loadMembers();
  }

  function updateDraft(memberId: string, patch: Partial<TeamDraft>) {
    setDrafts((current) => ({
      ...current,
      [memberId]: {
        ...(current[memberId] ?? { first_name: "", last_name: "", role: "support", is_active: true }),
        ...patch,
      },
    }));
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
                  <div className="grid gap-4">
                    <div>
                      <div className="font-semibold text-textPrimary">{member.name}</div>
                      <div className="text-sm text-textMuted">{member.email}</div>
                      <div className="text-sm text-textMuted">
                        {member.role} • {member.is_active ? "active" : "inactive"}
                      </div>
                    </div>
                    <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-center">
                      <Input
                        value={drafts[member.public_id]?.first_name ?? ""}
                        onChange={(e) => updateDraft(member.public_id, { first_name: e.target.value })}
                        placeholder="First name"
                      />
                      <Input
                        value={drafts[member.public_id]?.last_name ?? ""}
                        onChange={(e) => updateDraft(member.public_id, { last_name: e.target.value })}
                        placeholder="Last name"
                      />
                      <select
                        value={drafts[member.public_id]?.role ?? member.role}
                        onChange={(e) => updateDraft(member.public_id, { role: e.target.value })}
                        className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
                      >
                        <option value="support">Support</option>
                        <option value="admin">Admin</option>
                        <option value="superadmin">Superadmin</option>
                      </select>
                      <label className="flex items-center gap-2 text-sm text-textSecondary">
                        <input
                          type="checkbox"
                          checked={drafts[member.public_id]?.is_active ?? member.is_active}
                          onChange={(e) => updateDraft(member.public_id, { is_active: e.target.checked })}
                          className="rounded border-border"
                        />
                        Active
                      </label>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="secondary" onClick={() => updateMember(member).catch((err) => setMessage(String(err)))}>
                        Update
                      </Button>
                      <Button type="button" variant="secondary" onClick={() => removeMember(member).catch((err) => setMessage(String(err)))}>
                        Remove access
                      </Button>
                    </div>
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

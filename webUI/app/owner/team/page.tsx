"use client";

import { useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Organization {
  public_id: string;
  name: string;
}

interface Member {
  public_id: string;
  user_public_id: string;
  user_email: string;
  role: string;
  can_override_pricing: boolean;
  location_public_ids: string[];
}

interface LocationOption {
  public_id: string;
  name: string;
}

export default function OwnerTeamPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [orgId, setOrgId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    email: "",
    role: "staff",
    can_override_pricing: false,
    location_public_ids: [] as string[],
  });

  useEffect(() => {
    async function loadOrgs() {
      const token = getAccessToken() ?? undefined;
      try {
        const list = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
        setOrgs(list);
        if (list.length > 0) {
          setOrgId((current) => current || list[0].public_id);
        }
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to load organizations");
      } finally {
        setLoading(false);
      }
    }

    loadOrgs().catch(() => null);
  }, []);

  async function loadMembers() {
    if (!orgId) {
      setMembers([]);
      setLocations([]);
      return;
    }
    const token = getAccessToken() ?? undefined;
    const [memberList, locationList] = await Promise.all([
      apiFetch<Member[]>(`/api/orgs/${orgId}/members`, { method: "GET" }, token),
      apiFetch<LocationOption[]>(
        `/api/locations?organization_public_id=${encodeURIComponent(orgId)}`,
        { method: "GET" },
        token
      ),
    ]);
    setMembers(memberList);
    setLocations(locationList);
  }

  useEffect(() => {
    loadMembers().catch((err) =>
      setMessage(err instanceof Error ? err.message : "Failed to load team members")
    );
  }, [orgId]);

  async function addMember() {
    if (!orgId) return;
    setSaving(true);
    setMessage("");
    try {
      const token = getAccessToken() ?? undefined;
      await apiFetch(
        `/api/orgs/${orgId}/members`,
        {
          method: "POST",
          body: JSON.stringify({
            email: form.email,
            role: form.role,
            can_override_pricing: form.can_override_pricing,
            location_public_ids: form.role === "owner" ? [] : form.location_public_ids,
          }),
        },
        token
      );
      setMessage("Team member added");
      setForm({ email: "", role: "staff", can_override_pricing: false, location_public_ids: [] });
      await loadMembers();
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setSaving(false);
    }
  }

  function toggleLocation(locationPublicId: string) {
    setForm((current) => ({
      ...current,
      location_public_ids: current.location_public_ids.includes(locationPublicId)
        ? current.location_public_ids.filter((value) => value !== locationPublicId)
        : [...current.location_public_ids, locationPublicId],
    }));
  }

  const locationNameById = useMemo(() => {
    const map = new Map<string, string>();
    locations.forEach((location) => map.set(location.public_id, location.name));
    return map;
  }, [locations]);

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <h2 className="text-2xl font-semibold">Team</h2>
          <p className="text-textSecondary">
            Invite owners, admins, and staff and control which locations they can manage.
          </p>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <Card className="grid gap-4 p-4">
          <div className="grid gap-2">
            <Label htmlFor="org">Organization</Label>
            <select
              id="org"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              disabled={loading}
            >
              <option value="">Select an organization</option>
              {orgs.map((org) => (
                <option key={org.public_id} value={org.public_id}>
                  {org.name}
                </option>
              ))}
            </select>
          </div>
        </Card>

        <Card className="grid gap-4 p-4">
          <div className="text-sm font-semibold">Add member</div>
          <div className="grid gap-2 md:grid-cols-4">
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="admin@example.com"
            />
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={form.role}
              onChange={(e) =>
                setForm((current) => ({
                  ...current,
                  role: e.target.value,
                  location_public_ids: e.target.value === "owner" ? [] : current.location_public_ids,
                }))
              }
            >
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="staff">Staff</option>
            </select>
            <select
              className="h-10 rounded-md border border-border bg-surface px-3 text-sm text-textPrimary"
              value={form.can_override_pricing ? "true" : "false"}
              onChange={(e) => setForm({ ...form, can_override_pricing: e.target.value === "true" })}
            >
              <option value="false">No pricing override</option>
              <option value="true">Pricing override</option>
            </select>
            <Button type="button" onClick={addMember} disabled={!orgId || saving}>
              {saving ? "Adding..." : "Add"}
            </Button>
          </div>
          {form.role !== "owner" ? (
            <div className="grid gap-2">
              <div className="text-xs text-textMuted">Assigned locations</div>
              {locations.length === 0 ? (
                <div className="text-xs text-textMuted">
                  Add locations first before assigning admins or staff.
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  {locations.map((location) => (
                    <label key={location.public_id} className="flex items-center gap-2 text-sm text-textPrimary">
                      <input
                        type="checkbox"
                        checked={form.location_public_ids.includes(location.public_id)}
                        onChange={() => toggleLocation(location.public_id)}
                      />
                      <span>{location.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </Card>

        <Card className="p-4">
          {members.length === 0 ? (
            <div className="text-sm text-textMuted">No team members yet.</div>
          ) : (
            <div className="grid gap-3">
              {members.map((member) => (
                <div key={member.public_id} className="rounded-md border border-border p-3">
                  <div className="text-sm font-semibold text-textPrimary">{member.user_email}</div>
                  <div className="text-xs text-textMuted">
                    {member.role} • {member.user_public_id}
                  </div>
                  <div className="text-xs text-textMuted">
                    Pricing override: {member.can_override_pricing ? "Yes" : "No"}
                  </div>
                  {member.location_public_ids.length > 0 ? (
                    <div className="text-xs text-textMuted">
                      Locations:{" "}
                      {member.location_public_ids
                        .map((locationId) => locationNameById.get(locationId) || locationId)
                        .join(", ")}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}

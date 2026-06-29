"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { AssistantPolicy } from "@/lib/assistantTypes";

interface Organization {
  public_id: string;
  name: string;
}

interface LocationOption {
  public_id: string;
  name: string;
}

interface SpaceOption {
  public_id: string;
  name?: string | null;
  space_type: string;
}

export default function AssistantPoliciesPage() {
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [spaces, setSpaces] = useState<SpaceOption[]>([]);
  const [policies, setPolicies] = useState<AssistantPolicy[]>([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    scope_type: "organization",
    scope_public_id: "",
    category: "parking",
    title: "",
    body: "",
    source_url: "",
  });

  const token = useMemo(() => getAccessToken() ?? undefined, []);

  useEffect(() => {
    async function load() {
      const orgList = await apiFetch<Organization[]>("/api/orgs", { method: "GET" }, token);
      setOrgs(orgList);
      if (orgList[0]) {
        setForm((current) => ({ ...current, scope_public_id: orgList[0].public_id }));
        const locationList = await apiFetch<LocationOption[]>(
          `/api/locations?organization_public_id=${orgList[0].public_id}`,
          { method: "GET" },
          token,
        ).catch(() => []);
        setLocations(locationList);
        const spaceLists = await Promise.all(
          locationList.map((location) =>
            apiFetch<SpaceOption[]>(`/api/locations/${location.public_id}/spaces`, { method: "GET" }, token).catch(
              () => [],
            ),
          ),
        );
        setSpaces(spaceLists.flat());
      }
      const policyList = await apiFetch<AssistantPolicy[]>("/api/assistant/policies", { method: "GET" }, token);
      setPolicies(policyList);
    }
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load policies"));
  }, [token]);

  function scopeOptions() {
    if (form.scope_type === "location") return locations.map((item) => ({ value: item.public_id, label: item.name }));
    if (form.scope_type === "space") {
      return spaces.map((item) => ({
        value: item.public_id,
        label: item.name || item.space_type.replace("_", " "),
      }));
    }
    return orgs.map((item) => ({ value: item.public_id, label: item.name }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    try {
      const created = await apiFetch<AssistantPolicy>("/api/assistant/policies", {
        method: "POST",
        body: JSON.stringify({
          ...form,
          source_url: form.source_url || null,
        }),
      }, token);
      setPolicies((current) => [created, ...current]);
      setForm((current) => ({ ...current, title: "", body: "", source_url: "" }));
      setMessage("Policy saved.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save policy");
    }
  }

  async function archive(publicId: string) {
    await apiFetch(`/api/assistant/policies/${publicId}`, { method: "DELETE" }, token);
    setPolicies((current) => current.map((item) => (item.public_id === publicId ? { ...item, is_active: false } : item)));
  }

  return (
    <div className="space-y-6">
        <div>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">Assistant policies</h2>
          <p className="mt-1 text-[12px] text-text-3">Configure the structured source material the assistant cites for policy answers.</p>
        </div>
        {message ? <p className="text-[13px] text-text-3">{message}</p> : null}
        <Card>
          <form className="grid gap-4" onSubmit={submit}>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Scope</Label>
                <select
                  className="h-11 rounded-sm border border-border px-3 text-sm"
                  value={form.scope_type}
                  onChange={(event) => {
                    const nextType = event.target.value;
                    const nextOptions =
                      nextType === "location"
                        ? locations
                        : nextType === "space"
                          ? spaces
                          : orgs;
                    setForm((current) => ({
                      ...current,
                      scope_type: nextType,
                      scope_public_id: nextOptions[0]?.public_id || "",
                    }));
                  }}
                >
                  <option value="organization">Organization</option>
                  <option value="location">Location</option>
                  <option value="space">Space</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Record</Label>
                <select
                  className="h-11 rounded-sm border border-border px-3 text-sm"
                  value={form.scope_public_id}
                  onChange={(event) => setForm((current) => ({ ...current, scope_public_id: event.target.value }))}
                >
                  {scopeOptions().map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <select
                  className="h-11 rounded-sm border border-border px-3 text-sm"
                  value={form.category}
                  onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                >
                  {["parking", "wifi", "transit", "door_code", "cancellation", "guest_policy", "amenities", "support", "floor_plan"].map(
                    (category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ),
                  )}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Title</Label>
              <Input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>Policy Text</Label>
              <textarea
                className="min-h-28 w-full rounded-sm border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                value={form.body}
                onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Source URL</Label>
              <Input value={form.source_url} onChange={(event) => setForm((current) => ({ ...current, source_url: event.target.value }))} />
            </div>
            <Button type="submit">Save Policy</Button>
          </form>
        </Card>
        <div className="grid gap-4">
          {policies.map((policy) => (
            <Card key={policy.public_id} className={!policy.is_active ? "opacity-60" : ""}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs uppercase text-textMuted">{policy.scope_type} • {policy.category}</div>
                  <h3 className="mt-1 text-lg font-semibold text-textPrimary">{policy.title}</h3>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-textSecondary">{policy.body}</p>
                </div>
                <Button variant="secondary" size="sm" disabled={!policy.is_active} onClick={() => archive(policy.public_id)}>
                  Archive
                </Button>
              </div>
            </Card>
          ))}
        </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface AdminSpaceType {
  public_id: string;
  key: string;
  label: string;
  description: string | null;
  icon: string | null;
  archetype: string;
  marketplace_category: string | null;
  capacity_applicable: boolean;
  has_physical_inventory: boolean;
  sort_order: number;
  is_enabled: boolean;
  is_system: boolean;
  valid_booking_modes: string[];
  default_booking_mode: string | null;
}

const ARCHETYPES: Array<{ value: string; label: string; help: string }> = [
  { value: "room_hourly", label: "Hourly room", help: "Bookable by the hour or full day (meeting / event rooms)." },
  { value: "desk_pool", label: "Desk pool", help: "Pooled seats sold as day passes or monthly memberships." },
  { value: "private_office_lease", label: "Private office lease", help: "Exclusive office leased by the month." },
  { value: "suite_lease", label: "Suite lease", help: "Larger multi-room suite leased by the month." },
  { value: "virtual", label: "Virtual / address", help: "No physical workspace; virtual membership only." },
];

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "", label: "None (not publicly browsable)" },
  { value: "coworking", label: "Coworking & Day Passes" },
  { value: "private_office", label: "Private Offices" },
  { value: "meeting_room", label: "Meeting Rooms" },
];

const EMPTY_NEW = {
  key: "",
  label: "",
  description: "",
  archetype: "room_hourly",
  marketplace_category: "",
  capacity_applicable: true,
  has_physical_inventory: true,
  sort_order: 100,
};

export default function AdminSpaceTypesPage() {
  const [types, setTypes] = useState<AdminSpaceType[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "danger">("success");
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ ...EMPTY_NEW });
  const [editing, setEditing] = useState<Record<string, Partial<AdminSpaceType>>>({});

  const token = useMemo(() => getAccessToken() ?? undefined, []);

  function notify(text: string, tone: "success" | "danger" = "success") {
    setMessage(text);
    setMessageTone(tone);
  }

  async function load() {
    try {
      const data = await apiFetch<AdminSpaceType[]>("/api/admin/space-types", { method: "GET" }, token);
      setTypes(data ?? []);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load space types", "danger");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleEnabled(row: AdminSpaceType) {
    try {
      await apiFetch(
        `/api/admin/space-types/${row.public_id}`,
        { method: "PATCH", body: JSON.stringify({ is_enabled: !row.is_enabled }) },
        token
      );
      notify(`${row.label} ${row.is_enabled ? "disabled" : "enabled"}.`);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "danger");
    }
  }

  async function saveEdit(row: AdminSpaceType) {
    const patch = editing[row.public_id];
    if (!patch) return;
    const body: Record<string, unknown> = { ...patch };
    if ("marketplace_category" in body && body.marketplace_category === "") {
      body.marketplace_category = null;
    }
    try {
      await apiFetch(
        `/api/admin/space-types/${row.public_id}`,
        { method: "PATCH", body: JSON.stringify(body) },
        token
      );
      setEditing((cur) => {
        const next = { ...cur };
        delete next[row.public_id];
        return next;
      });
      notify(`${row.label} updated.`);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "danger");
    }
  }

  async function createType() {
    try {
      await apiFetch(
        "/api/admin/space-types",
        {
          method: "POST",
          body: JSON.stringify({
            ...draft,
            marketplace_category: draft.marketplace_category || null,
          }),
        },
        token
      );
      notify(`Created ${draft.label}.`);
      setDraft({ ...EMPTY_NEW });
      setShowNew(false);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err), "danger");
    }
  }

  function setEdit(publicId: string, field: keyof AdminSpaceType, value: unknown) {
    setEditing((cur) => ({ ...cur, [publicId]: { ...cur[publicId], [field]: value } }));
  }

  return (
    <AdminShell title="Space Types" breadcrumb={["Admin", "Space Types"]}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] text-text-3 max-w-2xl">
            Manage the space types owners can list. Each type uses a behavior archetype that
            controls how it is booked and priced. Disable a type to hide it from new listings and
            the public marketplace — existing spaces of that type keep working.
          </p>
          <Button variant="primary" onClick={() => setShowNew((v) => !v)} data-testid="new-space-type-button">
            {showNew ? "Cancel" : "New space type"}
          </Button>
        </div>

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

        {showNew ? (
          <Card padded={false} className="p-5">
            <div className="text-[14px] font-semibold mb-3">New space type</div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Key" hint="Lowercase snake_case, permanent identifier (e.g. day_office).">
                <Input
                  data-testid="new-space-type-key"
                  value={draft.key}
                  onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                  placeholder="day_office"
                />
              </Field>
              <Field label="Label" hint="Display name shown to owners and members.">
                <Input
                  data-testid="new-space-type-label"
                  value={draft.label}
                  onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                  placeholder="Day Office"
                />
              </Field>
              <Field label="Behavior archetype">
                <select
                  data-testid="new-space-type-archetype"
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px]"
                  value={draft.archetype}
                  onChange={(e) => setDraft({ ...draft, archetype: e.target.value })}
                >
                  {ARCHETYPES.map((a) => (
                    <option key={a.value} value={a.value}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Marketplace category">
                <select
                  className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-[13px]"
                  value={draft.marketplace_category}
                  onChange={(e) => setDraft({ ...draft, marketplace_category: e.target.value })}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Description">
                <Input
                  value={draft.description}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                  placeholder="Short description"
                />
              </Field>
              <Field label="Sort order">
                <Input
                  type="number"
                  value={String(draft.sort_order)}
                  onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
                />
              </Field>
            </div>
            <div className="mt-3 flex items-center gap-4">
              <label className="flex items-center gap-2 text-[13px] text-text-2">
                <input
                  type="checkbox"
                  checked={draft.capacity_applicable}
                  onChange={(e) => setDraft({ ...draft, capacity_applicable: e.target.checked })}
                />
                Has capacity
              </label>
              <label className="flex items-center gap-2 text-[13px] text-text-2">
                <input
                  type="checkbox"
                  checked={draft.has_physical_inventory}
                  onChange={(e) => setDraft({ ...draft, has_physical_inventory: e.target.checked })}
                />
                Has physical space
              </label>
              <div className="ml-auto">
                <Button variant="primary" onClick={() => void createType()} data-testid="create-space-type-submit">
                  Create
                </Button>
              </div>
            </div>
          </Card>
        ) : null}

        <Card padded={false} className="p-0 overflow-hidden">
          {loading ? (
            <div className="p-6 text-[13px] text-text-3">Loading…</div>
          ) : (
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-text-3">
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Archetype</th>
                  <th className="px-4 py-3">Category</th>
                  <th className="px-4 py-3">Booking modes</th>
                  <th className="px-4 py-3">Order</th>
                  <th className="px-4 py-3">Enabled</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {types.map((row) => {
                  const isEditing = Boolean(editing[row.public_id]);
                  const edit = editing[row.public_id] ?? {};
                  return (
                    <tr key={row.public_id} className="border-b border-border/60" data-testid={`space-type-row-${row.key}`}>
                      <td className="px-4 py-3">
                        <div className="font-medium flex items-center gap-2">
                          {isEditing ? (
                            <Input
                              value={(edit.label ?? row.label) as string}
                              onChange={(e) => setEdit(row.public_id, "label", e.target.value)}
                              className="h-8"
                            />
                          ) : (
                            row.label
                          )}
                          {row.is_system ? <Badge variant="violet">Built-in</Badge> : null}
                        </div>
                        <div className="text-[11px] text-text-3 font-mono">{row.key}</div>
                      </td>
                      <td className="px-4 py-3 text-text-2">{row.archetype}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <select
                            className="rounded-lg border border-border bg-surface px-2 py-1 text-[12px]"
                            value={(edit.marketplace_category ?? row.marketplace_category ?? "") as string}
                            onChange={(e) => setEdit(row.public_id, "marketplace_category", e.target.value)}
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-text-2">{row.marketplace_category ?? "—"}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-text-3">{row.valid_booking_modes.join(", ") || "—"}</td>
                      <td className="px-4 py-3">
                        {isEditing ? (
                          <Input
                            type="number"
                            value={String(edit.sort_order ?? row.sort_order)}
                            onChange={(e) => setEdit(row.public_id, "sort_order", Number(e.target.value))}
                            className="h-8 w-20"
                          />
                        ) : (
                          row.sort_order
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={row.is_enabled}
                            onChange={() => void toggleEnabled(row)}
                            data-testid={`space-type-enabled-${row.key}`}
                          />
                          <span className={row.is_enabled ? "text-success" : "text-text-3"}>
                            {row.is_enabled ? "On" : "Off"}
                          </span>
                        </label>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" onClick={() =>
                              setEditing((cur) => {
                                const next = { ...cur };
                                delete next[row.public_id];
                                return next;
                              })
                            }>
                              Cancel
                            </Button>
                            <Button variant="primary" onClick={() => void saveEdit(row)}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            onClick={() => setEditing((cur) => ({ ...cur, [row.public_id]: {} }))}
                          >
                            Edit
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
    </AdminShell>
  );
}

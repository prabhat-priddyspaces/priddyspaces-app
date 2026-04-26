"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Amenity {
  id: number;
  name: string;
  slug: string | null;
}

interface OrganizationAmenitiesManagerProps {
  orgId: string;
}

export function OrganizationAmenitiesManager({
  orgId,
}: OrganizationAmenitiesManagerProps) {
  const [amenities, setAmenities] = useState<Amenity[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [newAmenityName, setNewAmenityName] = useState("");
  const [editingAmenityId, setEditingAmenityId] = useState<number | null>(null);
  const [editingAmenityName, setEditingAmenityName] = useState("");

  useEffect(() => {
    async function loadAmenities() {
      if (!orgId) {
        setAmenities([]);
        return;
      }
      const token = getAccessToken() ?? undefined;
      setLoading(true);
      try {
        const list = await apiFetch<Amenity[]>(
          `/api/orgs/${orgId}/amenities`,
          { method: "GET" },
          token
        );
        setAmenities(list);
      } catch (err: unknown) {
        setMessage(err instanceof Error ? err.message : "Failed to load amenities");
      } finally {
        setLoading(false);
      }
    }

    loadAmenities().catch(() => null);
  }, [orgId]);

  async function createAmenity() {
    if (!orgId || !newAmenityName.trim()) return;
    const token = getAccessToken() ?? undefined;
    try {
      setMessage("");
      const amenity = await apiFetch<Amenity>(
        `/api/orgs/${orgId}/amenities`,
        {
          method: "POST",
          body: JSON.stringify({ name: newAmenityName.trim() }),
        },
        token
      );
      setAmenities((current) => [...current, amenity].sort((a, b) => a.name.localeCompare(b.name)));
      setNewAmenityName("");
      setMessage("Amenity created");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to create amenity");
    }
  }

  async function saveAmenity(amenityId: number) {
    if (!orgId || !editingAmenityName.trim()) return;
    const token = getAccessToken() ?? undefined;
    try {
      setMessage("");
      const updated = await apiFetch<Amenity>(
        `/api/orgs/${orgId}/amenities/${amenityId}`,
        {
          method: "PATCH",
          body: JSON.stringify({ name: editingAmenityName.trim() }),
        },
        token
      );
      setAmenities((current) =>
        current
          .map((amenity) => (amenity.id === amenityId ? updated : amenity))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
      setEditingAmenityId(null);
      setEditingAmenityName("");
      setMessage("Amenity updated");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to update amenity");
    }
  }

  async function removeAmenity(amenity: Amenity) {
    if (!orgId) return;
    if (!window.confirm(`Delete "${amenity.name}"? It will be removed from all locations.`)) {
      return;
    }
    const token = getAccessToken() ?? undefined;
    try {
      setMessage("");
      await apiFetch<{ ok: boolean }>(
        `/api/orgs/${orgId}/amenities/${amenity.id}`,
        { method: "DELETE" },
        token
      );
      setAmenities((current) => current.filter((item) => item.id !== amenity.id));
      setMessage("Amenity deleted");
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : "Failed to delete amenity");
    }
  }

  return (
    <Card className="grid gap-4 p-4">
      <div>
        <div className="text-sm font-semibold">Amenities</div>
        <div className="text-xs text-textMuted">
          Define the organization amenity catalog, then assign amenities on each location.
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-[1fr_auto]">
        <Input
          value={newAmenityName}
          onChange={(e) => setNewAmenityName(e.target.value)}
          placeholder="Add an amenity"
          disabled={!orgId}
        />
        <Button type="button" onClick={createAmenity} disabled={!orgId || !newAmenityName.trim()}>
          Add amenity
        </Button>
      </div>
      {message ? <div className="text-sm text-textMuted">{message}</div> : null}
      {loading ? (
        <div className="text-sm text-textMuted">Loading amenities...</div>
      ) : amenities.length === 0 ? (
        <div className="text-sm text-textMuted">
          {orgId ? "No amenities configured yet." : "Select an organization first."}
        </div>
      ) : (
        <div className="grid gap-3">
          {amenities.map((amenity) => {
            const isEditing = editingAmenityId === amenity.id;
            return (
              <div
                key={amenity.id}
                className="flex flex-col gap-2 rounded-md border border-border bg-surface px-3 py-3 md:flex-row md:items-center md:justify-between"
              >
                {isEditing ? (
                  <Input
                    value={editingAmenityName}
                    onChange={(e) => setEditingAmenityName(e.target.value)}
                  />
                ) : (
                  <div className="text-sm text-textPrimary">{amenity.name}</div>
                )}
                <div className="flex flex-wrap gap-2">
                  {isEditing ? (
                    <>
                      <Button type="button" size="sm" onClick={() => saveAmenity(amenity.id)}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingAmenityId(null);
                          setEditingAmenityName("");
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditingAmenityId(amenity.id);
                          setEditingAmenityName(amenity.name);
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => removeAmenity(amenity)}
                      >
                        Delete
                      </Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

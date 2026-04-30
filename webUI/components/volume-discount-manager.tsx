"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface Tier {
  public_id?: string;
  min_hours: number;
  discount_percent: number;
  is_active: boolean;
}

interface DraftRow {
  min_hours: string;
  discount_percent: string;
}

interface VolumeDiscountManagerProps {
  spacePublicId: string;
}

export function VolumeDiscountManager({ spacePublicId }: VolumeDiscountManagerProps) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!spacePublicId) return;
    const token = getAccessToken() ?? undefined;
    setLoading(true);
    apiFetch<Tier[]>(`/api/spaces/${spacePublicId}/volume-discounts`, { method: "GET" }, token)
      .then((tiers) => {
        setRows(
          tiers.map((t) => ({
            min_hours: String(t.min_hours),
            discount_percent: String(t.discount_percent),
          })),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load tiers"))
      .finally(() => setLoading(false));
  }, [spacePublicId]);

  function addRow() {
    setRows((prev) => [...prev, { min_hours: "", discount_percent: "" }]);
  }

  function removeRow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
  }

  function update(index: number, key: keyof DraftRow, value: string) {
    setRows((prev) => prev.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  async function save() {
    const token = getAccessToken() ?? undefined;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const tiers = rows
        .map((row) => ({
          min_hours: Number(row.min_hours),
          discount_percent: Number(row.discount_percent),
          is_active: true,
        }))
        .filter((t) => t.min_hours > 0 && t.discount_percent > 0 && t.discount_percent < 100);
      await apiFetch(
        `/api/spaces/${spacePublicId}/volume-discounts`,
        { method: "PUT", body: JSON.stringify({ tiers }) },
        token,
      );
      setMessage("Tiers saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="grid gap-4">
        <div>
          <h3 className="text-lg font-semibold">Volume discounts</h3>
          <p className="text-xs text-textMuted">
            Reward longer hourly bookings. Customers booking ≥ Min hours get the discount applied
            automatically. Discounts only apply to hourly bookings — Full day bookings use the day rate.
          </p>
        </div>
        {loading ? (
          <div className="text-sm text-textMuted">Loading…</div>
        ) : (
          <>
            <div className="grid gap-2">
              {rows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-textMuted">
                  No discount tiers yet.
                </div>
              ) : null}
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`min-${index}`}>Min hours</Label>
                    <Input
                      id={`min-${index}`}
                      value={row.min_hours}
                      onChange={(e) => update(index, "min_hours", e.target.value)}
                      placeholder="4"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`pct-${index}`}>Discount %</Label>
                    <Input
                      id={`pct-${index}`}
                      value={row.discount_percent}
                      onChange={(e) => update(index, "discount_percent", e.target.value)}
                      placeholder="10"
                    />
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeRow(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <Button type="button" variant="secondary" onClick={addRow}>
                Add tier
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving…" : "Save tiers"}
              </Button>
              {message ? <span className="text-sm text-success">{message}</span> : null}
              {error ? <span className="text-sm text-error">{error}</span> : null}
            </div>
          </>
        )}
      </div>
    </Card>
  );
}

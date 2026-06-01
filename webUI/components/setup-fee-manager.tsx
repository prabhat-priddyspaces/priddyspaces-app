"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface SetupFeeItem {
  public_id?: string | null;
  label: string;
  amount_cents: number;
  is_active: boolean;
  sort_order: number;
}

interface DraftRow {
  label: string;
  amount: string;
}

interface SetupFeeManagerProps {
  spacePublicId: string;
}

function formatAmount(cents: number) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function SetupFeeManager({ spacePublicId }: SetupFeeManagerProps) {
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!spacePublicId) return;
    const token = getAccessToken() ?? undefined;
    setLoading(true);
    apiFetch<SetupFeeItem[]>(`/api/spaces/${spacePublicId}/setup-fees`, { method: "GET" }, token)
      .then((items) => {
        setRows(
          items
            .filter((item) => item.is_active)
            .map((item) => ({
              label: item.label,
              amount: formatAmount(item.amount_cents),
            })),
        );
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Failed to load setup fees"))
      .finally(() => setLoading(false));
  }, [spacePublicId]);

  function addRow() {
    setRows((current) => [...current, { label: "", amount: "" }]);
  }

  function removeRow(index: number) {
    setRows((current) => current.filter((_, i) => i !== index));
  }

  function update(index: number, key: keyof DraftRow, value: string) {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, [key]: value } : row)));
  }

  async function save() {
    const token = getAccessToken() ?? undefined;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const items = rows
        .map((row, index) => ({
          label: row.label.trim(),
          amount_cents: Math.round(Number(row.amount) * 100),
          is_active: true,
          sort_order: index,
        }))
        .filter((item) => item.label && item.amount_cents > 0);
      await apiFetch(
        `/api/spaces/${spacePublicId}/setup-fees`,
        { method: "PUT", body: JSON.stringify({ items }) },
        token,
      );
      setRows(items.map((item) => ({ label: item.label, amount: formatAmount(item.amount_cents) })));
      setMessage("Setup fees saved");
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
          <h3 className="text-lg font-semibold">One-time setup fees</h3>
          <p className="text-xs text-textMuted">
            Mandatory setup costs shown before checkout and charged once per booking request.
          </p>
        </div>
        {loading ? (
          <div className="text-sm text-textMuted">Loading...</div>
        ) : (
          <>
            <div className="grid gap-2">
              {rows.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-3 text-sm text-textMuted">
                  No setup fees yet.
                </div>
              ) : null}
              {rows.map((row, index) => (
                <div key={index} className="grid grid-cols-[minmax(0,1fr)_140px_auto] items-end gap-2">
                  <div className="space-y-1">
                    <Label htmlFor={`setup-fee-label-${index}`}>Line item</Label>
                    <Input
                      id={`setup-fee-label-${index}`}
                      value={row.label}
                      onChange={(event) => update(index, "label", event.target.value)}
                      placeholder="Room setup"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`setup-fee-amount-${index}`}>Amount ($)</Label>
                    <Input
                      id={`setup-fee-amount-${index}`}
                      type="number"
                      min={0}
                      step="0.01"
                      inputMode="decimal"
                      value={row.amount}
                      onChange={(event) => update(index, "amount", event.target.value)}
                      placeholder="75"
                    />
                  </div>
                  <Button type="button" variant="ghost" onClick={() => removeRow(index)}>
                    Remove
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" onClick={addRow}>
                Add fee
              </Button>
              <Button type="button" onClick={save} disabled={saving}>
                {saving ? "Saving..." : "Save setup fees"}
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

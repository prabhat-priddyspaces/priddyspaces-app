"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { FloorPlanUpload } from "@/components/floor-plan-upload";
import { FloorPlanMarkers } from "@/components/floor-plan-markers";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface FloorPlan {
  public_id: string;
  image_url: string;
  version: number;
}

export function FloorPlanWorkspace({ locationPublicId }: { locationPublicId: string }) {
  const [floorPlans, setFloorPlans] = useState<FloorPlan[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function loadPlans() {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<FloorPlan[]>(
      `/api/locations/${locationPublicId}/floor-plans`,
      { method: "GET" },
      token
    );
    setFloorPlans(list);
    if (list.length > 0 && !selected) {
      setSelected(list[0].public_id);
    }
  }

  useEffect(() => {
    loadPlans().catch((err) => setMessage(err?.message || "Failed to load plans"));
  }, [locationPublicId]);

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-textMuted">Floor plans</div>
        <Button variant="secondary" onClick={loadPlans}>
          Refresh
        </Button>
      </div>
      {message ? <div className="text-xs text-error">{message}</div> : null}
      <div className="grid gap-2">
        <label className="text-sm text-textSecondary">Select plan</label>
        <select
          className="h-11 rounded-sm border border-border bg-white px-3 text-sm"
          value={selected || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="" disabled>
            Choose a floor plan
          </option>
          {floorPlans.map((plan) => (
            <option key={plan.public_id} value={plan.public_id}>
              Version {plan.version} ({plan.public_id})
            </option>
          ))}
        </select>
      </div>
      <FloorPlanUpload locationPublicId={locationPublicId} />
      {selected ? (
        <FloorPlanMarkers floorPlanPublicId={selected} />
      ) : (
        <div className="text-sm text-textMuted">Select a plan to manage markers.</div>
      )}
    </div>
  );
}

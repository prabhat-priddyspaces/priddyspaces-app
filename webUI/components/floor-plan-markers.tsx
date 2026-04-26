"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAccessToken } from "@/lib/auth";
import { apiFetch } from "@/lib/api";

interface Marker {
  public_id: string;
  space_id: number;
  x_coordinate: number;
  y_coordinate: number;
  width: number;
  height: number;
}

export function FloorPlanMarkers({ floorPlanPublicId }: { floorPlanPublicId: string }) {
  const [spacePublicId, setSpacePublicId] = useState("");
  const [coords, setCoords] = useState({ x: "0", y: "0", w: "10", h: "10" });
  const [markers, setMarkers] = useState<Marker[]>([]);
  const [message, setMessage] = useState("");

  async function loadMarkers() {
    const token = getAccessToken() ?? undefined;
    const list = await apiFetch<Marker[]>(
      `/api/floor-plans/${floorPlanPublicId}/markers`,
      { method: "GET" },
      token
    );
    setMarkers(list);
  }

  async function createMarker() {
    const token = getAccessToken() ?? undefined;
    const created = await apiFetch<Marker>(
      "/api/floor-plan-markers",
      {
        method: "POST",
        body: JSON.stringify({
          floor_plan_public_id: floorPlanPublicId,
          space_public_id: spacePublicId,
          x_coordinate: Number(coords.x),
          y_coordinate: Number(coords.y),
          width: Number(coords.w),
          height: Number(coords.h)
        })
      },
      token
    );
    setMarkers((prev) => [created, ...prev]);
    setMessage("Marker created");
  }

  return (
    <div className="grid gap-4">
      <div className="grid gap-3">
        <div className="text-sm text-textMuted">Create marker</div>
        <div className="grid gap-2">
          <Label>Space public id</Label>
          <Input value={spacePublicId} onChange={(e) => setSpacePublicId(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1">
            <Label>X</Label>
            <Input value={coords.x} onChange={(e) => setCoords({ ...coords, x: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>Y</Label>
            <Input value={coords.y} onChange={(e) => setCoords({ ...coords, y: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>W</Label>
            <Input value={coords.w} onChange={(e) => setCoords({ ...coords, w: e.target.value })} />
          </div>
          <div className="grid gap-1">
            <Label>H</Label>
            <Input value={coords.h} onChange={(e) => setCoords({ ...coords, h: e.target.value })} />
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={createMarker}>Save Marker</Button>
          <Button variant="secondary" onClick={loadMarkers}>
            Refresh List
          </Button>
        </div>
        {message ? <div className="text-xs text-textMuted">{message}</div> : null}
      </div>
      <div className="grid gap-2 text-sm text-textSecondary">
        {markers.length === 0 ? (
          <div>No markers loaded</div>
        ) : (
          markers.map((marker) => (
            <div key={marker.public_id} className="rounded-sm border border-border p-3">
              <div>Space ID: {marker.space_id}</div>
              <div>Coords: {marker.x_coordinate}, {marker.y_coordinate}</div>
              <div>Size: {marker.width} x {marker.height}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

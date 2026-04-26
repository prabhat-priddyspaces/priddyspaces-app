"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { FloorPlanWorkspace } from "@/components/floor-plan-workspace";

function FloorPlanEditorContent() {
  const searchParams = useSearchParams();
  const locationId = useMemo(() => searchParams.get("locationId") || "", [searchParams]);

  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Floor Plan Editor</h2>
            <p className="text-textSecondary">
              Upload a plan, draw spaces, and assign pricing.
            </p>
          </div>
        </div>
        <Card className="min-h-[420px]">
          <div className="flex h-full flex-col items-center justify-center gap-2 text-textMuted">
            <div className="text-sm">Canvas placeholder</div>
            <div className="text-xs">Konva/Fabric integration goes here</div>
          </div>
        </Card>
        <Card>
          {locationId ? (
            <FloorPlanWorkspace locationPublicId={locationId} />
          ) : (
            <div className="text-sm text-textMuted">Select a location first.</div>
          )}
        </Card>
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <div className="text-sm text-textMuted">Selected space</div>
            <div className="mt-2 text-sm text-textSecondary">
              Select a rectangle to edit details.
            </div>
          </Card>
          <Card>
            <div className="text-sm text-textMuted">Legend</div>
            <div className="mt-2 text-sm text-textSecondary">
              Available: accent outline, Occupied: gray fill.
            </div>
          </Card>
          <Card>
            <div className="text-sm text-textMuted">Version</div>
            <div className="mt-2 text-sm text-textSecondary">
              Floor plan versions are retained.
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

export default function FloorPlanEditor() {
  return (
    <Suspense
      fallback={
        <AppShell>
          <div className="grid gap-6">
            <div>
              <h2 className="text-2xl font-semibold">Floor Plan Editor</h2>
              <p className="text-textSecondary">
                Upload a plan, draw spaces, and assign pricing.
              </p>
            </div>
            <Card className="min-h-[420px]">
              <div className="flex h-full flex-col items-center justify-center gap-2 text-textMuted">
                <div className="text-sm">Loading floor plan...</div>
              </div>
            </Card>
          </div>
        </AppShell>
      }
    >
      <FloorPlanEditorContent />
    </Suspense>
  );
}

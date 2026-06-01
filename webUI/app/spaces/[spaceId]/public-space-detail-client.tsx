"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PublicSpaceDetailView } from "@/components/public-space-detail-view";

export function PublicSpaceDetailClient() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const searchParams = useSearchParams();
  const isLegacyPlaceholder = !spaceId || spaceId === "_" || spaceId === "_.html";
  const effectiveSpaceId =
    isLegacyPlaceholder ? searchParams.get("id") || "" : spaceId;
  return (
    <PublicSpaceDetailView
      spaceId={effectiveSpaceId}
      backHref={searchParams.get("back") || "/spaces"}
      initialDate={searchParams.get("date") ?? undefined}
      initialStartTime={searchParams.get("start_time") ?? undefined}
      initialEndTime={searchParams.get("end_time") ?? undefined}
      initialPlanPublicId={searchParams.get("plan") ?? undefined}
      initialMoveInDate={searchParams.get("move_in") ?? undefined}
      initialWaitlistPublicId={searchParams.get("waitlist") ?? undefined}
    />
  );
}

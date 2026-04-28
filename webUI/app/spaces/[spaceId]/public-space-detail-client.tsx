"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PublicSpaceDetailView } from "@/components/public-space-detail-view";

export function PublicSpaceDetailClient() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const searchParams = useSearchParams();
  // Static export only emits /spaces/_/index.html, so production URLs route
  // through the placeholder with the real id in ?id=. Path param wins for dev
  // mode and any /spaces/{id} legacy links.
  const effectiveSpaceId =
    !spaceId || spaceId === "_" ? searchParams.get("id") || "" : spaceId;
  return (
    <PublicSpaceDetailView
      spaceId={effectiveSpaceId}
      backHref={searchParams.get("back") || "/coworking"}
      initialDate={searchParams.get("date") ?? undefined}
      initialStartTime={searchParams.get("start_time") ?? undefined}
      initialEndTime={searchParams.get("end_time") ?? undefined}
    />
  );
}

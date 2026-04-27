"use client";

import { useParams, useSearchParams } from "next/navigation";
import { PublicSpaceDetailView } from "@/components/public-space-detail-view";

export function PublicSpaceDetailClient() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const searchParams = useSearchParams();
  return (
    <PublicSpaceDetailView
      spaceId={spaceId}
      backHref={searchParams.get("back") || "/coworking"}
      initialDate={searchParams.get("date") ?? undefined}
      initialStartTime={searchParams.get("start_time") ?? undefined}
      initialEndTime={searchParams.get("end_time") ?? undefined}
    />
  );
}

import { Suspense } from "react";

import { PublicLocationDetail } from "@/components/public-location-detail";

export default async function CoworkingLocationPage({
  params,
}: {
  params: Promise<{ locationId: string }>;
}) {
  const { locationId } = await params;
  return (
    <Suspense fallback={<main className="min-h-screen bg-background px-6 py-8 text-sm text-textMuted">Loading location…</main>}>
      <PublicLocationDetail routeKey="coworking" locationId={locationId} />
    </Suspense>
  );
}

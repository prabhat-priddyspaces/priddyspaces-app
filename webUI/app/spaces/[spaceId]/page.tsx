import { Suspense } from "react";

import { PublicSpaceDetailClient } from "./public-space-detail-client";

export function generateStaticParams() {
  return [{ spaceId: "_" }];
}

export default function PublicSpaceDetailPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background px-6 py-8 text-sm text-textMuted">Loading space…</main>}>
      <PublicSpaceDetailClient />
    </Suspense>
  );
}

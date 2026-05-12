import { Suspense } from "react";

import { PublicMarketplaceBrowser } from "@/components/public-marketplace-browser";

export default function SpacesPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-background px-6 py-8 text-sm text-textMuted">Loading marketplace…</main>}>
      <PublicMarketplaceBrowser routeKey="spaces" />
    </Suspense>
  );
}

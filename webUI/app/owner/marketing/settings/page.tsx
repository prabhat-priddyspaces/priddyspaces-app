"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Email sender settings now live under the unified Settings hub at
// /owner/settings/marketing. This route is kept as a redirect so existing
// links and bookmarks continue to work.
export default function LegacyMarketingSettingsRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/owner/settings/marketing");
  }, [router]);
  return null;
}

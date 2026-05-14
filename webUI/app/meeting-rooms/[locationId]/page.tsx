import { redirect } from "next/navigation";

import {
  legacyLocationRedirectHref,
  type LegacySearchParams,
} from "@/lib/legacy-marketplace-routes";

export function generateStaticParams() {
  return [{ locationId: "_" }, { locationId: "_.html" }];
}

export default async function LegacyMeetingRoomsLocationPage({
  params,
  searchParams,
}: {
  params: Promise<{ locationId: string }>;
  searchParams: Promise<LegacySearchParams>;
}) {
  const [{ locationId }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  redirect(legacyLocationRedirectHref("meeting-rooms", locationId, resolvedSearchParams));
}

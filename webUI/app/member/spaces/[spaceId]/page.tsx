import { PublicSpaceDetailView } from "@/components/public-space-detail-view";

export function generateStaticParams() {
  return [{ spaceId: "_" }];
}

export default async function SpaceDetailPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return <PublicSpaceDetailView spaceId={spaceId} backHref="/member" selfHrefBase="/member/spaces" />;
}

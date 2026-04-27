import { SpaceDetailView } from "@/components/space-detail-view";

export function generateStaticParams() {
  return [{ spaceId: "_" }];
}

export default async function SpaceDetailPage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const { spaceId } = await params;
  return <SpaceDetailView spaceId={spaceId} backHref="/customer" />;
}

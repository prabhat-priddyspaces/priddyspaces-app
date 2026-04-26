import { PublicSpaceDetailView } from "@/components/public-space-detail-view";

export const dynamic = "force-dynamic";

export default async function PublicSpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<{ back?: string; date?: string; start_time?: string; end_time?: string }>;
}) {
  const { spaceId } = await params;
  const { back, date, start_time, end_time } = await searchParams;
  return (
    <PublicSpaceDetailView
      spaceId={spaceId}
      backHref={back || "/coworking"}
      initialDate={date}
      initialStartTime={start_time}
      initialEndTime={end_time}
    />
  );
}

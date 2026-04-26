import BookingDetailClient from "./booking-detail-client";

export function generateStaticParams() {
  return [];
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return <BookingDetailClient bookingId={bookingId} />;
}

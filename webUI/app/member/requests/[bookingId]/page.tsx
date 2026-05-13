import { Suspense } from "react";

import BookingDetailClient from "./booking-detail-client";

export function generateStaticParams() {
  return [{ bookingId: "_" }];
}

export default async function BookingDetailPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  return (
    <Suspense fallback={<main className="min-h-screen bg-background px-6 py-8 text-sm text-textMuted">Loading request...</main>}>
      <BookingDetailClient bookingId={bookingId} />
    </Suspense>
  );
}

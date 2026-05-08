import { OwnerMemberDetailClient } from "./client";

export function generateStaticParams() {
  return [{ public_id: "_" }];
}

export default function OwnerMemberDetailPage() {
  return <OwnerMemberDetailClient />;
}

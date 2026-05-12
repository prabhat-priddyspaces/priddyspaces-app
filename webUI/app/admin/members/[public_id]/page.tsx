import { AdminMemberDetailClient } from "./client";

export function generateStaticParams() {
  return [{ public_id: "_" }];
}

export default function AdminMemberDetailPage() {
  return <AdminMemberDetailClient />;
}

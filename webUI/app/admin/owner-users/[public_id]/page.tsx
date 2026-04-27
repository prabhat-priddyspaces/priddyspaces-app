import { AdminOwnerUserDetailClient } from "./client";

export function generateStaticParams() {
  return [{ public_id: "_" }];
}

export default function AdminOwnerUserDetailPage() {
  return <AdminOwnerUserDetailClient />;
}

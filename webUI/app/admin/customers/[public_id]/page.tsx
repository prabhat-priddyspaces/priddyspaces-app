import { AdminCustomerDetailClient } from "./client";

export function generateStaticParams() {
  return [{ public_id: "_" }];
}

export default function AdminCustomerDetailPage() {
  return <AdminCustomerDetailClient />;
}

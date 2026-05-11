import { CampaignDetailClient } from "./client";

export function generateStaticParams() {
  return [{ public_id: "_" }];
}

export default function CampaignDetailPage() {
  return <CampaignDetailClient />;
}

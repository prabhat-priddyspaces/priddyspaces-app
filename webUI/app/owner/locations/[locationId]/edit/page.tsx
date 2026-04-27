import { EditLocationClient } from "./client";

export function generateStaticParams() {
  return [{ locationId: "_" }];
}

export default function EditLocationPage() {
  return <EditLocationClient />;
}

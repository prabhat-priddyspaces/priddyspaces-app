import { SpaceMediaClient } from "./client";

export function generateStaticParams() {
  return [{ spaceId: "_" }];
}

export default function SpaceMediaPage() {
  return <SpaceMediaClient />;
}

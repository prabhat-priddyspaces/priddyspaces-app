import { EditSpaceClient } from "./client";

export function generateStaticParams() {
  return [{ spaceId: "_" }];
}

export default function EditSpacePage() {
  return <EditSpaceClient />;
}

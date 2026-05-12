import { redirect } from "next/navigation";

import { DefaultMarketplaceRedirect } from "@/components/default-marketplace-redirect";

export default function Home() {
  if (process.env.NEXT_OUTPUT_MODE === "export") {
    return <DefaultMarketplaceRedirect />;
  }
  redirect("/spaces");
}

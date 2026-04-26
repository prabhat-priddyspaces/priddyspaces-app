import { MarketplaceBrowser } from "@/components/marketplace-browser";

export default function CustomerDashboard() {
  return (
    <MarketplaceBrowser
      detailHrefBase="/customer/spaces"
      showCustomerActions={true}
    />
  );
}

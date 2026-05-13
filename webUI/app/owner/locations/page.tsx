import { AppShell } from "@/components/app-shell";
import { LocationList } from "@/components/location-list";

export default function LocationsPage() {
  return (
    <AppShell title="Locations" breadcrumb={["Owner", "Operations"]}>
      <p className="text-[13px] text-text-3 mb-4">
        Manage locations and the rooms available at each site. Public marketplace pulls from this directly.
      </p>
      <LocationList />
    </AppShell>
  );
}

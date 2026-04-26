import { AppShell } from "@/components/app-shell";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { LocationList } from "@/components/location-list";

export default function LocationsPage() {
  return (
    <AppShell>
      <div className="grid gap-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-semibold">Locations</h2>
            <p className="text-textSecondary">
              Manage locations and the rooms available at each site.
            </p>
          </div>
          <Link href="/owner/locations/new">
            <Button>New Location</Button>
          </Link>
        </div>
        <LocationList />
      </div>
    </AppShell>
  );
}

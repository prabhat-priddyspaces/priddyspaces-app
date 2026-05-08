import { ClerkProvider } from "@clerk/nextjs";
import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

export const metadata = {
  title: "Priddyspaces Coworking",
  description: "Coworking platform MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const tree = (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
  if (IS_E2E_BYPASS) return tree;
  return <ClerkProvider>{tree}</ClerkProvider>;
}

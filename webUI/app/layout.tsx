import { ClerkProvider } from "@clerk/nextjs";
import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { AssistantMount } from "@/components/assistant-mount";
import { ClerkTokenSync } from "@/components/clerk-token-sync";
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
  if (IS_E2E_BYPASS) {
    return (
      <html lang="en">
        <body>
          {children}
          <AssistantMount />
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider
      // Both flows funnel through /dashboard, which reads /api/me and routes
      // by role: no role → /onboarding/personal; owner-no-org →
      // /onboarding/organization; owner → /owner; member → /spaces;
      // platform → /admin.
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="en">
        <body>
          <ClerkTokenSync />
          {children}
          <AssistantMount />
        </body>
      </html>
    </ClerkProvider>
  );
}

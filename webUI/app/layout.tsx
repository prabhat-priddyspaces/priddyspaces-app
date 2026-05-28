import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import "./_styles/tokens.css";
import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { AssistantMount } from "@/components/assistant-mount";
import { ClerkTokenSync } from "@/components/clerk-token-sync";
import { CommandPalette } from "@/components/command-palette";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

const geistSans = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
});

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
});

export const metadata = {
  title: "Priddyspaces Coworking",
  description: "Coworking platform MVP",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontClasses = `${geistSans.variable} ${geistMono.variable} font-sans`;
  if (IS_E2E_BYPASS) {
    return (
      <html lang="en" className={fontClasses}>
        <body>
          {children}
          <AssistantMount />
          <CommandPalette />
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider
      // Keep all auth UI on our own domain instead of Clerk's hosted Account
      // Portal (accounts.dev) by pointing at our custom catch-all pages.
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      // Both flows funnel through /dashboard, which reads /api/me and routes
      // by role: no role → /onboarding/personal; owner-no-org →
      // /onboarding/organization; owner → /owner; member → /spaces;
      // platform → /admin.
      signInForceRedirectUrl="/dashboard"
      signUpForceRedirectUrl="/dashboard"
      signInFallbackRedirectUrl="/dashboard"
      signUpFallbackRedirectUrl="/dashboard"
    >
      <html lang="en" className={fontClasses}>
        <body>
          <ClerkTokenSync />
          {children}
          <AssistantMount />
          <CommandPalette />
        </body>
      </html>
    </ClerkProvider>
  );
}

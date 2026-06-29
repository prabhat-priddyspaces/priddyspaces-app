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
import { ThemeProvider } from "@/components/theme-provider";
import { getClerkProviderRedirectProps } from "@/lib/clerk-urls";
import { IS_E2E_BYPASS } from "@/lib/e2e-bypass";

// Applies the saved theme (family + light/dark) to <html> before first paint
// so there is no flash of the wrong theme. Mirrors ThemeProvider's storage keys.
const THEME_INIT_SCRIPT = `(function(){try{var f=localStorage.getItem('ps-theme-family');var m=localStorage.getItem('ps-theme');var fam=(f==='warm'||f==='premium'||f==='neutral')?f:'neutral';var mode=(m==='light'||m==='dark'||m==='system')?m:'system';var dark=mode==='dark'||(mode==='system'&&window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches);var el=document.documentElement;el.setAttribute('data-theme',fam);el.classList.toggle('dark',dark);}catch(e){}})();`;

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
  const clerkRedirectProps = getClerkProviderRedirectProps();
  if (IS_E2E_BYPASS) {
    return (
      <html lang="en" className={fontClasses} data-theme="neutral" suppressHydrationWarning>
        <body>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          <ThemeProvider>
            {children}
            <AssistantMount />
            <CommandPalette />
          </ThemeProvider>
        </body>
      </html>
    );
  }
  return (
    <ClerkProvider
      // Keep all auth UI on our own domain instead of Clerk's hosted Account
      // Portal (accounts.dev) by pointing at our custom catch-all pages.
      // Both flows funnel through /dashboard, which reads /api/me and routes
      // by role: no role → /onboarding/member; owner-no-org →
      // /onboarding/owner; owner → /owner; member → /spaces;
      // platform → /admin.
      {...clerkRedirectProps}
    >
      <html lang="en" className={fontClasses} data-theme="neutral" suppressHydrationWarning>
        <body>
          <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
          <ClerkTokenSync />
          <ThemeProvider>
            {children}
            <AssistantMount />
            <CommandPalette />
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}

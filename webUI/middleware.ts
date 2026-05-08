import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Routes that do not require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/onboarding(.*)",
  "/coworking(.*)",
  "/marketplace(.*)",
  "/spaces(.*)",
  "/private-offices(.*)",
  "/meeting-rooms(.*)",
  "/terms(.*)",
  "/privacy(.*)",
  "/api/webhooks(.*)",
  "/api/health",
]);

const bypass = process.env.E2E_BYPASS_CLERK === "1";

export default bypass
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        await auth.protect();
      }
    });

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

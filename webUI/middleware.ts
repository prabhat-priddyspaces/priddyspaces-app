import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";

// Routes that do not require authentication
const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/owners/sign-up(.*)",
  "/onboarding(.*)",
  "/marketplace(.*)",
  "/spaces(.*)",
  "/locations(.*)",
  "/private-offices(.*)",
  "/meeting-rooms(.*)",
  "/terms(.*)",
  "/privacy(.*)",
  "/api/webhooks(.*)",
  "/api/health",
]);

const isHealthRoute = createRouteMatcher(["/api/health"]);
const bypass = process.env.E2E_BYPASS_CLERK === "1";

const protectedMiddleware = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    // Redirect unauthenticated users to our own sign-in page instead of
    // Clerk's hosted Account Portal (accounts.dev).
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
    });
  }
});

function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isHealthRoute(req)) {
    return NextResponse.next();
  }

  return protectedMiddleware(req, event);
}

export default bypass
  ? () => NextResponse.next()
  : middleware;

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};

const DEFAULT_SIGN_IN_PATH = "/sign-in";
const DEFAULT_SIGN_UP_PATH = "/sign-up";
const DEFAULT_POST_AUTH_PATH = "/dashboard";
const DEFAULT_SIGN_OUT_PATH = "/spaces";
const ABSOLUTE_HTTP_URL = /^https?:\/\//i;

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? "";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizePath(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("//")) {
    return `/${pathOrUrl.replace(/^\/+/, "")}`;
  }
  return pathOrUrl.startsWith("/") ? pathOrUrl : `/${pathOrUrl}`;
}

export function getAppOrigin(): string {
  const origin =
    readEnv("NEXT_PUBLIC_APP_ORIGIN") ||
    readEnv("NEXT_PUBLIC_FRONTEND_ORIGIN");

  return origin ? trimTrailingSlash(origin) : "";
}

export function toAppUrl(pathOrUrl: string): string {
  if (ABSOLUTE_HTTP_URL.test(pathOrUrl)) {
    return pathOrUrl;
  }

  const path = normalizePath(pathOrUrl);
  const origin = getAppOrigin();
  return origin ? `${origin}${path}` : path;
}

function configuredUrl(envName: string, fallbackPath: string): string {
  return toAppUrl(readEnv(envName) || fallbackPath);
}

export function getClerkProviderRedirectProps() {
  return {
    signInUrl: configuredUrl(
      "NEXT_PUBLIC_CLERK_SIGN_IN_URL",
      DEFAULT_SIGN_IN_PATH,
    ),
    signUpUrl: configuredUrl(
      "NEXT_PUBLIC_CLERK_SIGN_UP_URL",
      DEFAULT_SIGN_UP_PATH,
    ),
    signInForceRedirectUrl: configuredUrl(
      "NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL",
      DEFAULT_POST_AUTH_PATH,
    ),
    signUpForceRedirectUrl: configuredUrl(
      "NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL",
      DEFAULT_POST_AUTH_PATH,
    ),
    signInFallbackRedirectUrl: configuredUrl(
      "NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL",
      DEFAULT_POST_AUTH_PATH,
    ),
    signUpFallbackRedirectUrl: configuredUrl(
      "NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL",
      DEFAULT_POST_AUTH_PATH,
    ),
  };
}

export function getSignOutRedirectTarget(
  redirectTo: string | null | undefined,
): string | null {
  const target =
    typeof redirectTo === "undefined" ? DEFAULT_SIGN_OUT_PATH : redirectTo;

  return target ? toAppUrl(target) : null;
}

import { getValidAccessToken, isImpersonationToken } from "@/lib/auth";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

function buildRequestInit(opts: RequestInit, token?: string | null): RequestInit {
  const headers = new Headers(opts.headers || {});
  const hasBody = typeof opts.body !== "undefined" && opts.body !== null;
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return {
    ...opts,
    credentials: "include",
    headers,
  };
}

function responseWithConsumedBody(response: Response, body: string): Response {
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function parseJsonBody(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function isExpiredTokenResponse(response: Response, body: string): boolean {
  if (response.status !== 401) return false;
  const parsed = parseJsonBody(body);
  return (
    parsed !== null &&
    typeof parsed === "object" &&
    !Array.isArray(parsed) &&
    (parsed as { detail?: unknown }).detail === "Token expired"
  );
}

function messageFromErrorBody(body: string, fallback: string): string {
  const parsed = parseJsonBody(body);
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    const detail = (parsed as { detail?: unknown }).detail;
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return body || fallback;
}

export async function fetchApiWithAuthRetry(
  path: string,
  opts: RequestInit = {},
  token?: string | null,
): Promise<Response> {
  const requestToken = await getValidAccessToken(token);
  const first = await fetch(`${API_BASE_URL}${path}`, buildRequestInit(opts, requestToken));
  if (first.ok || !requestToken || isImpersonationToken(requestToken)) {
    return first;
  }

  const firstBody = await first.text();
  if (!isExpiredTokenResponse(first, firstBody)) {
    return responseWithConsumedBody(first, firstBody);
  }

  const refreshedToken = await getValidAccessToken(requestToken, { forceRefresh: true });
  if (!refreshedToken) {
    return responseWithConsumedBody(first, firstBody);
  }

  return fetch(`${API_BASE_URL}${path}`, buildRequestInit(opts, refreshedToken));
}

export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
  token?: string
): Promise<T> {
  const res = await fetchApiWithAuthRetry(path, opts, token);

  if (!res.ok) {
    const text = await res.text();
    throw new Error(messageFromErrorBody(text, "Request failed"));
  }

  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

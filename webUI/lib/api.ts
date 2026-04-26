export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "";

export async function apiFetch<T>(
  path: string,
  opts: RequestInit = {},
  token?: string
): Promise<T> {
  const headers = new Headers(opts.headers || {});
  const hasBody = typeof opts.body !== "undefined" && opts.body !== null;
  const isFormData = typeof FormData !== "undefined" && opts.body instanceof FormData;
  if (hasBody && !isFormData && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(`${API_BASE_URL}${path}`,
    {
    ...opts,
    credentials: "include",
    headers
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }

  return res.json() as Promise<T>;
}

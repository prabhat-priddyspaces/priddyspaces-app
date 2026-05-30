import { apiFetch } from "./api";

export type AccessPass = {
  public_id: string;
  booking_public_id: string;
  booking_request_public_id: string | null;
  qr_payload: string;
  status: string;
  pass_status: string;
  valid_from_at: string;
  expires_at: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  member_name: string | null;
  member_email: string | null;
  location_public_id: string;
  location_name: string;
  space_public_id: string;
  space_name: string | null;
  space_type: string;
  start_datetime: string;
  end_datetime: string;
};

export type AccessPassResolve = {
  public_id: string | null;
  booking_public_id: string | null;
  booking_request_public_id: string | null;
  member_name: string | null;
  member_email: string | null;
  location_public_id: string | null;
  location_name: string | null;
  space_public_id: string | null;
  space_name: string | null;
  space_type: string | null;
  start_datetime: string | null;
  end_datetime: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
  pass_status: string;
  can_check_in: boolean;
  can_check_out: boolean;
  message: string | null;
};

export type AttendanceRecord = {
  public_id: string | null;
  booking_public_id: string;
  access_pass_public_id: string | null;
  member_public_id: string | null;
  member_name: string | null;
  member_email: string | null;
  scanned_by_public_id: string | null;
  scanned_by_name: string | null;
  location_public_id: string;
  location_name: string;
  space_public_id: string;
  space_name: string | null;
  space_type: string;
  start_datetime: string;
  end_datetime: string;
  checked_in_at: string | null;
  checked_out_at: string | null;
  status: string;
  event_type: string | null;
  event_at: string | null;
};

export type AttendanceList = {
  results: AttendanceRecord[];
  total: number;
  page: number;
  page_size: number;
};

export type MemberDirectoryItem = {
  member_public_id: string;
  name: string | null;
  email: string;
  location_public_id: string;
  location_name: string;
  space_public_id: string;
  space_name: string | null;
  space_type: string;
  last_seen_at: string | null;
};

export type AttendanceFilters = {
  location_public_id?: string;
  date?: string;
  space_type?: string;
  currently_in_office?: boolean;
  status?: string;
  search?: string;
  page?: number;
  page_size?: number;
};

export function extractAccessPassToken(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  const hashIndex = value.indexOf("#");
  if (hashIndex >= 0) {
    const fragment = value.slice(hashIndex + 1);
    if (fragment.includes("=")) {
      return decodeURIComponent(fragment.split("token=")[1]?.split("&")[0] || "").trim();
    }
    return decodeURIComponent(fragment).trim();
  }
  const tokenMatch = value.match(/[?&]token=([^&]+)/);
  if (tokenMatch) return decodeURIComponent(tokenMatch[1]).trim();
  return value;
}

function tokenBody(rawToken: string) {
  return JSON.stringify({ token: extractAccessPassToken(rawToken) });
}

export function listAccessPasses(token?: string) {
  return apiFetch<AccessPass[]>("/api/access-passes", { method: "GET" }, token);
}

export function resolveAccessPass(rawToken: string, token?: string) {
  return apiFetch<AccessPassResolve>(
    "/api/access-passes/resolve",
    { method: "POST", body: tokenBody(rawToken) },
    token,
  );
}

export function checkInAccessPass(rawToken: string, token?: string) {
  return apiFetch<AccessPassResolve>(
    "/api/access-passes/check-in",
    { method: "POST", body: tokenBody(rawToken) },
    token,
  );
}

export function checkOutAccessPass(rawToken: string, token?: string) {
  return apiFetch<AccessPassResolve>(
    "/api/access-passes/check-out",
    { method: "POST", body: tokenBody(rawToken) },
    token,
  );
}

export function listAttendance(filters: AttendanceFilters = {}, token?: string) {
  const query = Object.entries(filters)
    .filter(([, value]) => !(value === undefined || value === null || value === "" || value === false))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
  return apiFetch<AttendanceList>(`/api/attendance${query ? `?${query}` : ""}`, { method: "GET" }, token);
}

export function listMemberDirectory(token?: string) {
  return apiFetch<MemberDirectoryItem[]>("/api/member/directory", { method: "GET" }, token);
}

/** Keep digits only, cap at 10 (US-style local number). */
export function sanitizePhone(raw: string): string {
  return raw.replace(/\D/g, "").slice(0, 10);
}

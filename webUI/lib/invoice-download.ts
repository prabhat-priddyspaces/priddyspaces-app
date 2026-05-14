import { API_BASE_URL } from "@/lib/api";

function filenameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;
  const match = disposition.match(/filename="?([^";]+)"?/i);
  return match?.[1] || fallback;
}

export async function downloadInvoicePdf(publicId: string, token?: string): Promise<void> {
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/api/invoices/${publicId}/pdf`, {
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || "Unable to download invoice PDF");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filenameFromDisposition(
    response.headers.get("Content-Disposition"),
    `invoice-${publicId}.pdf`
  );
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

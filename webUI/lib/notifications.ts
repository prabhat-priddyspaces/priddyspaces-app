import { apiFetch } from "@/lib/api";

export interface PushConfig {
  web_push_enabled: boolean;
  web_push_public_key: string | null;
  expo_push_enabled: boolean;
}

export interface NotificationPreference {
  booking_start_push_enabled: boolean;
  booking_end_push_enabled: boolean;
}

export interface AppNotification {
  public_id: string;
  audience: string;
  reminder_type: string;
  title: string;
  body: string;
  link_url: string | null;
  is_read: boolean;
  read_at: string | null;
  push_status: string;
  push_error: string | null;
  created_at: string | null;
}

export interface NotificationList {
  results: AppNotification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
}

export function getPushConfig(token?: string) {
  return apiFetch<PushConfig>("/api/push/config", { method: "GET" }, token);
}

export function listNotifications(token?: string, unreadOnly = false) {
  const query = unreadOnly ? "?unread_only=true" : "";
  return apiFetch<NotificationList>(`/api/notifications${query}`, { method: "GET" }, token);
}

export function markNotificationRead(publicId: string, token?: string) {
  return apiFetch<{ status: string }>(`/api/notifications/${publicId}/read`, { method: "PATCH" }, token);
}

export function getNotificationPreferences(token?: string) {
  return apiFetch<NotificationPreference>("/api/notifications/preferences", { method: "GET" }, token);
}

export function updateNotificationPreferences(payload: Partial<NotificationPreference>, token?: string) {
  return apiFetch<NotificationPreference>(
    "/api/notifications/preferences",
    { method: "PATCH", body: JSON.stringify(payload) },
    token
  );
}

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export async function registerBrowserPush(token?: string): Promise<{ status: string; message: string }> {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return { status: "unsupported", message: "Browser push is not available here." };
  }
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { status: "unsupported", message: "This browser does not support push notifications." };
  }
  const config = await getPushConfig(token);
  if (!config.web_push_enabled || !config.web_push_public_key) {
    return { status: "disabled", message: "Push notifications are not configured for this environment." };
  }
  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { status: permission, message: "Browser notification permission is not enabled." };
  }
  const registration = await navigator.serviceWorker.register("/push-worker.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(config.web_push_public_key),
    }));
  await apiFetch(
    "/api/push-subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        provider: "web",
        subscription: subscription.toJSON(),
        user_agent: navigator.userAgent,
        device_name: "Web browser",
      }),
    },
    token
  );
  return { status: "granted", message: "Booking reminders are enabled for this browser." };
}

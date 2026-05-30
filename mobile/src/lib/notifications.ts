import * as Notifications from "expo-notifications";

import { apiFetch } from "./api";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export type NotificationPreference = {
  booking_start_push_enabled: boolean;
  booking_end_push_enabled: boolean;
};

export type AppNotification = {
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
};

export type NotificationList = {
  results: AppNotification[];
  total: number;
  unread_count: number;
  page: number;
  page_size: number;
};

export function listNotifications(token?: string) {
  return apiFetch<NotificationList>("/api/notifications", { method: "GET" }, token);
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

export async function registerExpoPushToken(token?: string, requestPermission = false) {
  if (!token) return { status: "missing_token", message: "Sign in to enable notifications." };
  const current = await Notifications.getPermissionsAsync();
  let finalStatus = current.status;
  if (finalStatus !== "granted" && requestPermission) {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }
  if (finalStatus !== "granted") {
    return { status: finalStatus, message: "Notification permission is not enabled." };
  }
  const expoToken = await Notifications.getExpoPushTokenAsync();
  await apiFetch(
    "/api/push-subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        provider: "expo",
        token: expoToken.data,
        device_name: "Mobile app",
      }),
    },
    token
  );
  return { status: "granted", message: "Booking reminders are enabled on this device." };
}

export function addNotificationTapListener(handler: (data: Record<string, unknown>) => void) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    handler((response.notification.request.content.data || {}) as Record<string, unknown>);
  });
}

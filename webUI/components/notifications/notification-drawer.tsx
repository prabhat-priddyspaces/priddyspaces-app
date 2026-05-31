"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { getAccessToken } from "@/lib/auth";
import {
  AppNotification,
  listNotifications,
  markNotificationRead,
  registerBrowserPush,
} from "@/lib/notifications";
import { cn } from "@/lib/utils";

interface NotificationDrawerProps {
  open: boolean;
  onClose: () => void;
  onUnreadCountChange?: (count: number) => void;
}

function formatNotificationTime(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function NotificationDrawer({ open, onClose, onUnreadCountChange }: NotificationDrawerProps) {
  const [rows, setRows] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    if (!token) return;
    setLoading(true);
    try {
      const result = await listNotifications(token);
      setRows(result.results);
      setUnreadCount(result.unread_count);
      onUnreadCountChange?.(result.unread_count);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setLoading(false);
    }
  }, [onUnreadCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (open) void load();
  }, [load, open]);

  async function enablePush() {
    const token = getAccessToken() ?? undefined;
    setMessage("");
    try {
      const result = await registerBrowserPush(token);
      setMessage(result.message);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unable to enable browser notifications");
    }
  }

  async function markRead(row: AppNotification) {
    if (row.is_read) return;
    const token = getAccessToken() ?? undefined;
    setRows((current) => current.map((item) => (item.public_id === row.public_id ? { ...item, is_read: true } : item)));
    const nextUnread = Math.max(0, unreadCount - 1);
    setUnreadCount(nextUnread);
    onUnreadCountChange?.(nextUnread);
    try {
      await markNotificationRead(row.public_id, token);
    } catch {
      await load();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close notifications"
        className="absolute inset-0 bg-black/20"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 h-full w-full max-w-[380px] overflow-y-auto border-l border-line bg-bg p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-text">Notifications</h2>
            <p className="text-xs text-text-3">{unreadCount} unread</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="mt-4 rounded-xl border border-line bg-surface p-3">
          <div className="text-sm font-medium text-text">Booking reminders</div>
          <p className="mt-1 text-xs text-text-3">Enable browser notifications on this device for upcoming booking alerts.</p>
          <Button type="button" size="sm" className="mt-3" onClick={enablePush}>
            Enable browser push
          </Button>
          {message ? <div className="mt-2 text-xs text-text-3">{message}</div> : null}
        </div>
        {loading && rows.length === 0 ? <div className="mt-4 text-sm text-text-3">Loading notifications...</div> : null}
        {!loading && rows.length === 0 ? (
          <div className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm text-text-3">
            No booking or account notifications yet.
          </div>
        ) : null}
        <div className="mt-4 grid gap-2">
          {rows.map((row) => {
            const content = (
              <div
                className={cn(
                  "rounded-xl border border-line bg-surface p-3 text-left transition-colors",
                  !row.is_read && "border-brand/40 bg-brand/5"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="text-sm font-semibold text-text">{row.title}</div>
                  {!row.is_read ? <span className="mt-1 h-2 w-2 rounded-full bg-brand" aria-label="Unread" /> : null}
                </div>
                <div className="mt-1 text-sm text-text-2">{row.body}</div>
                <div className="mt-2 text-xs text-text-3">{formatNotificationTime(row.created_at)}</div>
              </div>
            );
            return row.link_url ? (
              <Link key={row.public_id} href={row.link_url} onClick={() => void markRead(row)}>
                {content}
              </Link>
            ) : (
              <button key={row.public_id} type="button" onClick={() => void markRead(row)}>
                {content}
              </button>
            );
          })}
        </div>
      </aside>
    </div>
  );
}

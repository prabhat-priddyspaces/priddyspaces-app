"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  CalendarEvent,
  formatCurrency,
  formatDateTime,
  statusColorClass,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";

type Viewer = "owner" | "admin" | "member";

interface EventQuickActionPopoverProps {
  event: CalendarEvent;
  onClose: () => void;
  onChanged: () => void;
  viewer?: Viewer;
  memberHref?: (memberPublicId: string) => string;
}

type ActionState = { busy: boolean; error: string | null; message: string | null };

export function EventQuickActionPopover({
  event,
  onClose,
  onChanged,
  viewer = "owner",
  memberHref,
}: EventQuickActionPopoverProps) {
  const [state, setState] = useState<ActionState>({ busy: false, error: null, message: null });

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function call(path: string, init: RequestInit = {}) {
    const token = getAccessToken() ?? undefined;
    setState({ busy: true, error: null, message: null });
    try {
      await apiFetch(path, init, token);
      setState({ busy: false, error: null, message: "Done" });
      onChanged();
    } catch (err) {
      setState({
        busy: false,
        error: err instanceof Error ? err.message : "Action failed",
        message: null,
      });
    }
  }

  const { kind, public_id } = event;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <Card className="w-full max-w-md p-5 sm:rounded-lg">
        <div className="flex items-start justify-between">
          <div>
            <div className="text-sm text-textMuted">{event.kind.toUpperCase()}</div>
            {event.member.public_id && memberHref ? (
              <Link
                href={memberHref(event.member.public_id)}
                className="text-base font-semibold text-textPrimary hover:text-accent hover:underline"
              >
                {event.member.name}
              </Link>
            ) : (
              <div className="text-base font-semibold text-textPrimary">{event.member.name}</div>
            )}
            <div className="text-xs text-textMuted">{event.member.email}</div>
          </div>
          <span
            className={cn(
              "rounded-sm border px-2 py-0.5 text-xs",
              statusColorClass(event.status)
            )}
          >
            {event.status}
          </span>
        </div>

        <div className="mt-4 grid gap-1 text-sm text-textPrimary">
          <div>
            <span className="text-textMuted">Space: </span>
            {event.space_name || "Unnamed"} · {event.location_name}
          </div>
          <div>
            <span className="text-textMuted">When: </span>
            {formatDateTime(event.start, null)} – {formatDateTime(event.end, null)}
          </div>
          {event.amount_cents != null ? (
            <div>
              <span className="text-textMuted">Amount: </span>
              {formatCurrency(event.amount_cents)}
            </div>
          ) : null}
          {event.payment_status ? (
            <div>
              <span className="text-textMuted">Payment: </span>
              {event.payment_status}
            </div>
          ) : null}
          {event.plan_name ? (
            <div>
              <span className="text-textMuted">Plan: </span>
              {event.plan_name}
            </div>
          ) : null}
        </div>

        {state.error ? <div className="mt-3 text-sm text-error">{state.error}</div> : null}
        {state.message ? <div className="mt-3 text-sm text-success">{state.message}</div> : null}

        <div className="mt-5 flex flex-wrap gap-2">
          {viewer !== "member" && kind === "request" && event.status === "request.requested" ? (
            <>
              <Button
                size="sm"
                onClick={() =>
                  call(`/api/booking-requests/${public_id}/approve`, {
                    method: "POST",
                    body: JSON.stringify({ operator_notes: null }),
                  })
                }
                disabled={state.busy}
              >
                Approve
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  call(`/api/booking-requests/${public_id}/reject`, {
                    method: "POST",
                    body: JSON.stringify({ operator_notes: null }),
                  })
                }
                disabled={state.busy}
              >
                Reject
              </Button>
            </>
          ) : null}
          {viewer !== "member" && kind === "request" && event.status === "request.payment_failed" ? (
            <Button
              size="sm"
              onClick={() =>
                call(`/api/booking-requests/${public_id}/retry-payment`, {
                  method: "POST",
                  body: JSON.stringify({ operator_notes: null }),
                })
              }
              disabled={state.busy}
            >
              Retry payment
            </Button>
          ) : null}
          {kind === "booking" && event.status === "booking.confirmed" ? (
            <>
              {viewer !== "member" ? (
                !event.checked_in ? (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => call(`/api/bookings/${public_id}/check-in`, { method: "POST" })}
                    disabled={state.busy}
                  >
                    Check in
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => call(`/api/bookings/${public_id}/check-out`, { method: "POST" })}
                    disabled={state.busy}
                  >
                    Check out
                  </Button>
                )
              ) : null}
              <Button
                size="sm"
                variant="destructive"
                onClick={() => call(`/api/bookings/${public_id}/cancel`, { method: "POST" })}
                disabled={state.busy}
              >
                Cancel booking
              </Button>
            </>
          ) : null}
          <a
            href={`mailto:${event.member.email}?subject=Your booking at ${encodeURIComponent(
              event.location_name
            )}`}
            className="inline-flex h-9 items-center rounded-sm border border-border bg-white px-3 text-xs text-textSecondary hover:bg-surface2"
          >
            Email member
          </a>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>
      </Card>
    </div>
  );
}

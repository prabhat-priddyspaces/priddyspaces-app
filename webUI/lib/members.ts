export interface MemberStats {
  total_bookings: number;
  confirmed_bookings: number;
  canceled_bookings: number;
  no_shows: number;
  open_requests: number;
  total_revenue_cents: number;
  active_subscriptions: number;
  first_booking_at: string | null;
  last_booking_at: string | null;
}

export interface MemberListItem {
  user_public_id: string;
  organization_public_id: string;
  name: string;
  email: string;
  status: string;
  phone: string | null;
  company_name: string | null;
  tags: string[];
  notes_preview: string | null;
  materialized: boolean;
  stats: MemberStats;
}

export interface MemberDetail {
  user_public_id: string;
  organization_public_id: string;
  name: string;
  email: string;
  status: string;
  phone: string | null;
  company_name: string | null;
  tags: string[];
  notes: string | null;
  materialized: boolean;
  stats: MemberStats;
}

export const MEMBER_STATUSES = ["lead", "active", "churned", "blocked"] as const;
export type MemberStatus = (typeof MEMBER_STATUSES)[number];

export function memberStatusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-success/15 text-success border-success/40";
    case "lead":
      return "bg-info/15 text-info border-info/40";
    case "churned":
      return "bg-textMuted/10 text-textMuted border-textMuted/30";
    case "blocked":
      return "bg-error/15 text-error border-error/40";
    default:
      return "bg-surface2 text-textPrimary border-border";
  }
}

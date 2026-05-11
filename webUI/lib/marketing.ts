export interface OrganizationOption {
  public_id: string;
  name: string;
}

export interface MarketingTemplate {
  public_id: string;
  organization_public_id: string;
  name: string;
  subject: string;
  html_body: string | null;
  text_body: string | null;
  category: string | null;
  classification: string | null;
  variables: string[];
  is_archived: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface Segment {
  public_id: string;
  organization_public_id: string;
  name: string;
  description: string | null;
  filters: Record<string, unknown>;
  preview_count: number;
  is_archived: boolean;
  last_previewed_at: string | null;
}

export interface Campaign {
  public_id: string;
  organization_public_id: string;
  name: string;
  status: string;
  template_public_id: string;
  segment_public_id: string | null;
  sender_lane: string;
  scheduled_at: string | null;
  total_count: number;
  eligible_count: number;
  suppressed_count: number;
  no_email_count: number;
  queued_count: number;
  sent_count: number;
  delivered_count: number;
  opened_count: number;
  clicked_count: number;
  bounced_count: number;
  failed_count: number;
  unsubscribed_count: number;
  created_at: string | null;
}

export interface CampaignReview {
  total: number;
  eligible: number;
  suppressed: number;
  no_email: number;
  already_snapshotted: number;
}

export interface CampaignRecipient {
  public_id: string;
  user_public_id: string;
  email: string;
  status: string;
  suppression_reason: string | null;
  provider_message_id: string | null;
  created_at: string | null;
}

export interface VerifiedSender {
  public_id: string;
  email: string;
  name: string | null;
  status: string;
  sendgrid_sender_id: string | null;
  last_checked_at: string | null;
}

export interface SenderSettings {
  organization_public_id: string;
  default_sender_lane: string;
  allowed_lanes: string[];
  shared_daily_cap: number;
  verified_sender_daily_cap: number;
  shared_from_email: string;
  shared_from_name: string | null;
  verified_sender_public_id: string | null;
  verified_senders: VerifiedSender[];
}

export interface Suppression {
  public_id: string;
  organization_public_id: string;
  user_public_id: string | null;
  email: string;
  reason: string;
  status: string;
  source: string;
  resubscribed_at: string | null;
  created_at: string | null;
}

export interface Workflow {
  public_id: string;
  organization_public_id: string;
  name: string;
  status: string;
  graph: { nodes?: any[]; edges?: any[] };
  current_version_public_id: string | null;
}

export interface WorkflowRun {
  public_id: string;
  workflow_public_id: string;
  user_public_id: string;
  status: string;
  current_node_id: string | null;
  next_run_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
}

export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export function statusTone(status: string): string {
  switch (status) {
    case "sent":
    case "delivered":
    case "verified":
    case "active":
    case "completed":
      return "border-success/40 bg-success/10 text-success";
    case "failed":
    case "bounced":
    case "canceled":
    case "suppressed":
      return "border-error/40 bg-error/10 text-error";
    case "scheduled":
    case "pending":
    case "waiting":
      return "border-warning/40 bg-warning/10 text-warning";
    default:
      return "border-border bg-surface2 text-textSecondary";
  }
}

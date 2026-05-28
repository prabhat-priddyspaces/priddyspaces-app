export interface LoyaltyWallet {
  public_id: string;
  organization_public_id: string;
  organization_name: string;
  promo_balance: number;
  earned_balance: number;
  total_balance: number;
  lifetime_earned_points: number;
  tier: string;
  point_value_cents: number;
  cash_value_cents: number;
  next_expiration_at: string | null;
  expiring_points: number;
}

export interface LoyaltyLedgerEntry {
  public_id: string;
  entry_type: string;
  point_type: string;
  points: number;
  source: string;
  source_public_id: string | null;
  expires_at: string | null;
  note: string | null;
  created_at: string | null;
}

export interface LoyaltySettings {
  public_id: string;
  organization_public_id: string;
  is_enabled: boolean;
  accepts_priddy_points: boolean;
  owner_points_redemption_enabled: boolean;
  point_value_cents: number;
  earn_rate_bps: number;
  earn_points_per_dollar: number;
  earn_points_per_100_dollars: number;
  max_redemption_percent: number;
  allowed_space_types: string[];
  allowed_booking_modes: string[];
  promo_expiration_days: number;
  earned_expiration_days: number;
  campaign_daily_issue_cap: number;
  max_promo_grant_points: number;
  updated_at: string | null;
}

export interface PriddyPointsWallet {
  public_id: string;
  balance: number;
  lifetime_earned_points: number;
  point_value_cents: number;
  cash_value_cents: number;
}

export interface LoyaltyCampaign {
  public_id: string;
  organization_public_id: string;
  name: string;
  campaign_type: string;
  status: string;
  rules_json: Record<string, unknown>;
  reward_json: Record<string, unknown>;
  budget_points: number | null;
  issued_points: number;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface LoyaltyOwnerSummary {
  organization_public_id: string;
  points_issued: number;
  points_redeemed: number;
  outstanding_points: number;
  outstanding_liability_cents: number;
  redemption_rate_percent: number;
  repeat_member_rate_percent: number;
  active_wallets: number;
  campaigns: number;
  top_members: Array<{
    user_public_id: string | null;
    name: string;
    email: string;
    points: number;
    tier: string;
  }>;
}

export interface LoyaltyRedemptionPreview {
  eligible: boolean;
  reason: string | null;
  organization_public_id: string | null;
  wallet_public_id: string | null;
  promo_balance: number;
  earned_balance: number;
  total_balance: number;
  point_value_cents: number;
  subtotal_cents: number;
  max_redeemable_points: number;
  max_discount_cents: number;
  requested_points: number;
  discount_cents: number;
  priddy: LoyaltyRedemptionBucket;
  owner: LoyaltyRedemptionBucket;
}

export interface LoyaltyRedemptionBucket {
  eligible: boolean;
  reason: string | null;
  balance: number;
  point_value_cents: number;
  max_redeemable_points: number;
  requested_points: number;
  discount_cents: number;
}

export interface LoyaltyRedemptionLock {
  public_id: string;
  organization_public_id: string;
  points: number;
  priddy_points: number;
  promo_points: number;
  earned_points: number;
  discount_cents: number;
  status: string;
  expires_at: string;
}

export function formatCents(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value % 100 === 0 ? 0 : 2,
  }).format(value / 100);
}

export function formatPoints(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString();
}

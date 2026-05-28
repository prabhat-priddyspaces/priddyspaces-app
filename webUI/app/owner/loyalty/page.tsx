"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import {
  LoyaltyCampaign,
  LoyaltyOwnerSummary,
  LoyaltySettings,
  formatCents,
  formatDate,
  formatPoints,
} from "@/lib/loyalty";
import type { OrganizationOption } from "@/lib/marketing";

const campaignTypes = [
  { value: "signup_bonus", label: "Signup bonus" },
  { value: "first_booking_bonus", label: "First booking bonus" },
  { value: "inactive_winback", label: "Inactive winback" },
  { value: "happy_hour", label: "Happy hour" },
  { value: "weekend_multiplier", label: "Weekend multiplier" },
  { value: "manual", label: "Manual campaign" },
];

export default function OwnerLoyaltyPage() {
  const [orgs, setOrgs] = useState<OrganizationOption[]>([]);
  const [orgId, setOrgId] = useState("");
  const [settings, setSettings] = useState<LoyaltySettings | null>(null);
  const [summary, setSummary] = useState<LoyaltyOwnerSummary | null>(null);
  const [campaigns, setCampaigns] = useState<LoyaltyCampaign[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    campaign_type: "first_booking_bonus",
    point_type: "promo",
    points: "500",
    budget_points: "",
    status: "draft",
  });
  const [manualForm, setManualForm] = useState({
    user_public_id: "",
    point_type: "promo",
    points: "100",
    note: "",
  });

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<OrganizationOption[]>("/api/orgs", { method: "GET" }, token)
      .then((list) => {
        setOrgs(list);
        if (list[0]) setOrgId(list[0].public_id);
      })
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load organizations"));
  }, []);

  const load = useCallback(async (currentOrgId = orgId) => {
    if (!currentOrgId) return;
    const token = getAccessToken() ?? undefined;
    const qs = `organization_public_id=${encodeURIComponent(currentOrgId)}`;
    const [settingsResp, summaryResp, campaignsResp] = await Promise.all([
      apiFetch<LoyaltySettings>(`/api/loyalty/settings?${qs}`, { method: "GET" }, token),
      apiFetch<LoyaltyOwnerSummary>(`/api/loyalty/owner/summary?${qs}`, { method: "GET" }, token),
      apiFetch<LoyaltyCampaign[]>(`/api/loyalty/campaigns?${qs}`, { method: "GET" }, token),
    ]);
    setSettings(settingsResp);
    setSummary(summaryResp);
    setCampaigns(campaignsResp);
  }, [orgId]);

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load loyalty"));
  }, [load]);

  const settingsDraft = useMemo(() => {
    if (!settings) return null;
    return {
      is_enabled: settings.is_enabled,
      accepts_priddy_points: settings.accepts_priddy_points,
      owner_points_redemption_enabled: settings.owner_points_redemption_enabled,
      point_value_cents: settings.point_value_cents,
      earn_points_per_100_dollars: settings.earn_points_per_100_dollars,
      max_redemption_percent: settings.max_redemption_percent,
      allowed_space_types: settings.allowed_space_types,
      allowed_booking_modes: settings.allowed_booking_modes,
      promo_expiration_days: settings.promo_expiration_days,
      earned_expiration_days: settings.earned_expiration_days,
      campaign_daily_issue_cap: settings.campaign_daily_issue_cap,
      max_promo_grant_points: settings.max_promo_grant_points,
    };
  }, [settings]);

  async function saveSettings() {
    if (!settingsDraft || !settings) return;
    const token = getAccessToken() ?? undefined;
    setSaving(true);
    setMessage("");
    try {
      const qs = `organization_public_id=${encodeURIComponent(orgId)}`;
      const updated = await apiFetch<LoyaltySettings>(
        `/api/loyalty/settings?${qs}`,
        { method: "PUT", body: JSON.stringify(settingsDraft) },
        token,
      );
      setSettings(updated);
      setMessage("Loyalty settings saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Settings save failed");
    } finally {
      setSaving(false);
    }
  }

  function updateSetting(field: keyof LoyaltySettings, value: number | boolean) {
    if (!settings) return;
    setSettings({ ...settings, [field]: value });
  }

  function toggleSettingList(field: "allowed_space_types" | "allowed_booking_modes", value: string) {
    if (!settings) return;
    const current = settings[field] || [];
    const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
    setSettings({ ...settings, [field]: next });
  }

  async function createCampaign() {
    const token = getAccessToken() ?? undefined;
    setMessage("");
    try {
      await apiFetch<LoyaltyCampaign>(
        "/api/loyalty/campaigns",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            name: campaignForm.name,
            campaign_type: campaignForm.campaign_type,
            status: campaignForm.status,
            reward_json: {
              point_type: campaignForm.point_type,
              points: Number(campaignForm.points || 0),
            },
            rules_json: {},
            budget_points: campaignForm.budget_points ? Number(campaignForm.budget_points) : null,
          }),
        },
        token,
      );
      setCampaignForm({ ...campaignForm, name: "" });
      setMessage("Campaign saved");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Campaign save failed");
    }
  }

  async function toggleCampaign(campaign: LoyaltyCampaign) {
    const token = getAccessToken() ?? undefined;
    const nextStatus = campaign.status === "active" ? "paused" : "active";
    try {
      await apiFetch<LoyaltyCampaign>(
        `/api/loyalty/campaigns/${campaign.public_id}`,
        { method: "PATCH", body: JSON.stringify({ status: nextStatus }) },
        token,
      );
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Campaign update failed");
    }
  }

  async function manualGrant() {
    const token = getAccessToken() ?? undefined;
    setMessage("");
    try {
      await apiFetch(
        "/api/loyalty/manual-adjustments",
        {
          method: "POST",
          body: JSON.stringify({
            organization_public_id: orgId,
            user_public_id: manualForm.user_public_id,
            point_type: manualForm.point_type,
            points: Number(manualForm.points || 0),
            note: manualForm.note,
          }),
        },
        token,
      );
      setManualForm({ user_public_id: "", point_type: "promo", points: "100", note: "" });
      setMessage("Manual points granted");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Manual grant failed");
    }
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-textPrimary">Loyalty</h2>
            <p className="text-textSecondary">Owner-funded points, Priddy Points acceptance, and redemption eligibility.</p>
          </div>
          <select
            value={orgId}
            onChange={(event) => setOrgId(event.target.value)}
            className="h-10 rounded-sm border border-border bg-surface px-3 text-sm text-textPrimary"
          >
            {orgs.map((org) => (
              <option key={org.public_id} value={org.public_id}>
                {org.name}
              </option>
            ))}
          </select>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        {summary ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Metric label="Outstanding liability" value={formatCents(summary.outstanding_liability_cents)} />
            <Metric label="Points issued" value={formatPoints(summary.points_issued)} />
            <Metric label="Points redeemed" value={formatPoints(summary.points_redeemed)} />
            <Metric label="Repeat member rate" value={`${summary.repeat_member_rate_percent}%`} />
          </div>
        ) : null}

        {settings ? (
          <Card className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="text-sm font-semibold text-textPrimary">Reward settings</div>
                <div className="text-sm text-textSecondary">
                  {settings.earn_points_per_100_dollars} points per $100 spent. Points can cover up to {settings.max_redemption_percent}% of eligible bookings.
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm text-textSecondary">
                <input
                  type="checkbox"
                  checked={settings.is_enabled}
                  onChange={(event) => updateSetting("is_enabled", event.target.checked)}
                />
                Owner points enabled
              </label>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <NumberField label="Point value (cents)" value={settings.point_value_cents} min={1} max={10} onChange={(value) => updateSetting("point_value_cents", value)} />
              <NumberField label="Points per $100" value={settings.earn_points_per_100_dollars} min={0} max={1000} onChange={(value) => updateSetting("earn_points_per_100_dollars", value)} />
              <NumberField label="Max redemption %" value={settings.max_redemption_percent} min={0} max={100} onChange={(value) => updateSetting("max_redemption_percent", value)} />
              <NumberField label="Promo expiry days" value={settings.promo_expiration_days} min={1} max={730} onChange={(value) => updateSetting("promo_expiration_days", value)} />
              <NumberField label="Earned expiry days" value={settings.earned_expiration_days} min={30} max={1095} onChange={(value) => updateSetting("earned_expiration_days", value)} />
              <NumberField label="Daily issue cap" value={settings.campaign_daily_issue_cap} min={0} max={5000000} onChange={(value) => updateSetting("campaign_daily_issue_cap", value)} />
              <NumberField label="Max promo grant" value={settings.max_promo_grant_points} min={0} max={1000000} onChange={(value) => updateSetting("max_promo_grant_points", value)} />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="rounded-sm border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-textPrimary">
                  <input type="checkbox" checked={settings.accepts_priddy_points} onChange={(event) => updateSetting("accepts_priddy_points", event.target.checked)} />
                  Accept Priddy Points
                </label>
                <div className="mt-1 text-xs text-textMuted">Members can use platform points as a discount on eligible listings.</div>
              </div>
              <div className="rounded-sm border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-textPrimary">
                  <input type="checkbox" checked={settings.owner_points_redemption_enabled} onChange={(event) => updateSetting("owner_points_redemption_enabled", event.target.checked)} />
                  Allow owner point redemption
                </label>
                <div className="mt-1 text-xs text-textMuted">Members can spend this owner's points on eligible listings.</div>
              </div>
              <div className="flex items-end">
                <Button type="button" onClick={saveSettings} disabled={saving}>
                  {saving ? "Saving..." : "Save settings"}
                </Button>
              </div>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <EligibilityGroup
                title="Owner point space types"
                options={[
                  ["shared_desk", "Shared desk"],
                  ["conference_room", "Conference room"],
                  ["virtual_office", "Virtual office"],
                  ["private_office", "Private office"],
                  ["suite", "Suite"],
                ]}
                selected={settings.allowed_space_types}
                onToggle={(value) => toggleSettingList("allowed_space_types", value)}
              />
              <EligibilityGroup
                title="Owner point booking types"
                options={[
                  ["day_pass", "Day pass"],
                  ["hourly", "Hourly"],
                ]}
                selected={settings.allowed_booking_modes}
                onToggle={(value) => toggleSettingList("allowed_booking_modes", value)}
              />
            </div>
          </Card>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="p-4">
            <div className="text-sm font-semibold text-textPrimary">Campaign builder</div>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <Input value={campaignForm.name} onChange={(event) => setCampaignForm({ ...campaignForm, name: event.target.value })} placeholder="Campaign name" />
              <select value={campaignForm.campaign_type} onChange={(event) => setCampaignForm({ ...campaignForm, campaign_type: event.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
                {campaignTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              <select value={campaignForm.status} onChange={(event) => setCampaignForm({ ...campaignForm, status: event.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
                <option value="draft">Draft</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
              </select>
              <select value={campaignForm.point_type} onChange={(event) => setCampaignForm({ ...campaignForm, point_type: event.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
                <option value="promo">Promo points</option>
                <option value="earned">Earned points</option>
              </select>
              <Input type="number" min="1" value={campaignForm.points} onChange={(event) => setCampaignForm({ ...campaignForm, points: event.target.value })} placeholder="Reward points" />
              <Input type="number" min="0" value={campaignForm.budget_points} onChange={(event) => setCampaignForm({ ...campaignForm, budget_points: event.target.value })} placeholder="Budget points" />
            </div>
            <div className="mt-4">
              <Button type="button" onClick={createCampaign} disabled={!campaignForm.name || Number(campaignForm.points) <= 0}>
                Create campaign
              </Button>
            </div>
          </Card>

          <Card className="p-4">
            <div className="text-sm font-semibold text-textPrimary">Manual grant</div>
            <div className="mt-4 grid gap-3">
              <Input value={manualForm.user_public_id} onChange={(event) => setManualForm({ ...manualForm, user_public_id: event.target.value })} placeholder="Member public ID" />
              <select value={manualForm.point_type} onChange={(event) => setManualForm({ ...manualForm, point_type: event.target.value })} className="h-11 rounded-sm border border-border bg-white px-3 text-sm">
                <option value="promo">Promo points</option>
                <option value="earned">Earned points</option>
              </select>
              <Input type="number" min="1" value={manualForm.points} onChange={(event) => setManualForm({ ...manualForm, points: event.target.value })} placeholder="Points" />
              <Input value={manualForm.note} onChange={(event) => setManualForm({ ...manualForm, note: event.target.value })} placeholder="Audit reason" />
              <Button type="button" onClick={manualGrant} disabled={!manualForm.user_public_id || !manualForm.note || Number(manualForm.points) <= 0}>
                Grant points
              </Button>
            </div>
          </Card>
        </div>

        <Card className="overflow-hidden p-0">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold text-textPrimary">Campaigns</div>
          {campaigns.length === 0 ? (
            <div className="p-4 text-sm text-textMuted">No loyalty campaigns yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-surface2 text-xs uppercase text-textMuted">
                <tr>
                  <th className="px-3 py-2 text-left">Campaign</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Issued</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-left">Ends</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.public_id} className="border-t border-border">
                    <td className="px-3 py-2">
                      <div className="font-medium text-textPrimary">{campaign.name}</div>
                      <div className="text-xs text-textMuted">{campaign.campaign_type.replaceAll("_", " ")}</div>
                    </td>
                    <td className="px-3 py-2 capitalize text-textSecondary">{campaign.status}</td>
                    <td className="px-3 py-2 text-right">{formatPoints(campaign.issued_points)}</td>
                    <td className="px-3 py-2 text-right">{campaign.budget_points == null ? "-" : formatPoints(campaign.budget_points)}</td>
                    <td className="px-3 py-2 text-textMuted">{formatDate(campaign.ends_at)}</td>
                    <td className="px-3 py-2 text-right">
                      <Button type="button" size="sm" variant="secondary" onClick={() => toggleCampaign(campaign)} disabled={campaign.status === "archived"}>
                        {campaign.status === "active" ? "Pause" : "Activate"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        {summary && summary.top_members.length > 0 ? (
          <Card className="p-4">
            <div className="text-sm font-semibold text-textPrimary">Top members by balance</div>
            <div className="mt-3 grid gap-2">
              {summary.top_members.map((member) => (
                <div key={member.user_public_id || member.email} className="flex items-center justify-between rounded-sm border border-border px-3 py-2 text-sm">
                  <div>
                    <div className="font-medium text-textPrimary">{member.name}</div>
                    <div className="text-xs text-textMuted">{member.email}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold text-textPrimary">{formatPoints(member.points)}</div>
                    <div className="text-xs text-textMuted">{member.tier}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ) : null}
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-textMuted">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-textPrimary">{value}</div>
    </Card>
  );
}

function EligibilityGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string;
  options: Array<[string, string]>;
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="rounded-sm border border-border p-3">
      <div className="text-sm font-semibold text-textPrimary">{title}</div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm text-textSecondary">
            <input type="checkbox" checked={(selected || []).includes(value)} onChange={() => onToggle(value)} />
            {label}
          </label>
        ))}
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-1 text-sm text-textSecondary">
      <span>{label}</span>
      <Input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

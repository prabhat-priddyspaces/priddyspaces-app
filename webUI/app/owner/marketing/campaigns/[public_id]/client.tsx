"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import type { Campaign, CampaignRecipient, CampaignReview } from "@/lib/marketing";
import { formatDateTime, statusTone } from "@/lib/marketing";
import { cn } from "@/lib/utils";

export function CampaignDetailClient() {
  const params = useParams<{ public_id: string }>();
  const publicId = params?.public_id || "";
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [review, setReview] = useState<CampaignReview | null>(null);
  const [recipients, setRecipients] = useState<CampaignRecipient[]>([]);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const token = getAccessToken() ?? undefined;
    const [campaignResult, reviewResult, recipientResult] = await Promise.all([
      apiFetch<Campaign>(`/api/marketing/campaigns/${publicId}`, { method: "GET" }, token),
      apiFetch<CampaignReview>(`/api/marketing/campaigns/${publicId}/review-breakdown`, { method: "GET" }, token).catch(() => null),
      apiFetch<CampaignRecipient[]>(`/api/marketing/campaigns/${publicId}/recipients`, { method: "GET" }, token).catch(() => []),
    ]);
    setCampaign(campaignResult);
    setReview(reviewResult);
    setRecipients(recipientResult);
  }, [publicId]);

  useEffect(() => {
    load().catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load campaign"));
  }, [load]);

  async function sendNow() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(`/api/marketing/campaigns/${publicId}/send`, { method: "POST", body: JSON.stringify({}) }, token);
      setMessage("Campaign sent");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Send failed");
    }
  }

  async function cancel() {
    const token = getAccessToken() ?? undefined;
    try {
      await apiFetch(`/api/marketing/campaigns/${publicId}/cancel`, { method: "POST" }, token);
      setMessage("Campaign canceled");
      await load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cancel failed");
    }
  }

  if (!campaign) {
    return (
      <AppShell>
        <div className="text-sm text-textMuted">{message || "Loading campaign..."}</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="grid gap-6">
        <div>
          <Link href="/owner/marketing/campaigns" className="text-xs text-accent hover:underline">Campaigns</Link>
          <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-textPrimary">{campaign.name}</h2>
              <div className="mt-1 flex items-center gap-2">
                <span className={cn("rounded-sm border px-2 py-0.5 text-xs capitalize", statusTone(campaign.status))}>{campaign.status}</span>
                <span className="text-sm text-textMuted">{campaign.sender_lane.replace("_", " ")}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button type="button" onClick={sendNow} disabled={!["draft", "scheduled"].includes(campaign.status)}>Send now</Button>
              <Button type="button" variant="secondary" onClick={cancel} disabled={["sent", "canceled"].includes(campaign.status)}>Cancel</Button>
            </div>
          </div>
        </div>

        {message ? <div className="text-sm text-textMuted">{message}</div> : null}

        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Eligible" value={campaign.eligible_count} />
          <Metric label="Sent" value={campaign.sent_count} />
          <Metric label="Opened" value={campaign.opened_count} />
          <Metric label="Clicked" value={campaign.clicked_count} />
        </div>

        {review ? (
          <Card className="p-4 text-sm text-textSecondary">
            Review: total {review.total}, eligible {review.eligible}, suppressed {review.suppressed}, no email {review.no_email}
          </Card>
        ) : null}

        <div className="overflow-hidden rounded-md border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface2 text-xs uppercase text-textMuted">
              <tr>
                <th className="px-3 py-2 text-left">Email</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Provider ID</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((recipient) => (
                <tr key={recipient.public_id} className="border-t border-border">
                  <td className="px-3 py-2 text-textPrimary">{recipient.email}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-sm border px-2 py-0.5 text-xs capitalize", statusTone(recipient.status))}>{recipient.status}</span>
                    {recipient.suppression_reason ? <div className="text-xs text-textMuted">{recipient.suppression_reason}</div> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-textMuted">{recipient.provider_message_id || "—"}</td>
                  <td className="px-3 py-2 text-textMuted">{formatDateTime(recipient.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </AppShell>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-textMuted">{label}</div>
      <div className="mt-1 text-xl font-semibold text-textPrimary">{value}</div>
    </Card>
  );
}

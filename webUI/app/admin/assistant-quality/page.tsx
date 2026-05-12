"use client";

import { useEffect, useState } from "react";

import { AdminShell } from "@/components/admin-shell";
import { Card } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

interface AssistantQuality {
  metrics: Record<string, number>;
  low_rated_conversations: Array<{ conversation_public_id: string | null; reason: string | null }>;
  missing_policy_categories: Array<{ category: string; count: number }>;
  reliability_events: Array<{ kind: string; count: number }>;
  recent_reliability_events: Array<{
    kind: string;
    conversation_public_id: string | null;
    message_public_id: string;
    details: Record<string, unknown>;
  }>;
  tool_failure_rates: Array<{ tool: string; failures: number }>;
  usage_by_persona: Array<{ audience: string; conversations: number }>;
  abandoned_booking_drafts: Array<Record<string, unknown>>;
}

export default function AssistantQualityPage() {
  const [data, setData] = useState<AssistantQuality | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = getAccessToken() ?? undefined;
    apiFetch<AssistantQuality>("/api/admin/assistant-quality", { method: "GET" }, token)
      .then(setData)
      .catch((err) => setMessage(err instanceof Error ? err.message : "Failed to load assistant quality"));
  }, []);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold text-textPrimary">Assistant Quality</h2>
          <p className="text-textSecondary">Conversation quality, tool reliability, policy gaps, and usage.</p>
        </div>
        {message ? <div className="text-sm text-error">{message}</div> : null}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Conversations", data?.metrics.conversations ?? 0],
            ["Messages", data?.metrics.messages ?? 0],
            ["Feedback", data?.metrics.feedback_count ?? 0],
            ["Thumbs Down", data?.metrics.thumbs_down_rate ?? 0],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <div className="text-sm text-textMuted">{label}</div>
              <div className="mt-2 text-2xl font-semibold text-textPrimary">{value}</div>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Usage by Persona</h3>
            <div className="mt-4 space-y-3">
              {data?.usage_by_persona.length ? (
                data.usage_by_persona.map((item) => (
                  <div key={item.audience} className="flex justify-between text-sm">
                    <span className="text-textSecondary">{item.audience}</span>
                    <span className="font-medium text-textPrimary">{item.conversations}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No usage yet.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Missing Policies</h3>
            <div className="mt-4 space-y-3">
              {data?.missing_policy_categories.length ? (
                data.missing_policy_categories.map((item) => (
                  <div key={item.category} className="flex justify-between text-sm">
                    <span className="text-textSecondary">{item.category}</span>
                    <span className="font-medium text-textPrimary">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No policy gaps logged.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Tool Failures</h3>
            <div className="mt-4 space-y-3">
              {data?.tool_failure_rates.length ? (
                data.tool_failure_rates.map((item) => (
                  <div key={item.tool} className="flex justify-between text-sm">
                    <span className="text-textSecondary">{item.tool}</span>
                    <span className="font-medium text-textPrimary">{item.failures}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No tool failures logged.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Reliability Events</h3>
            <div className="mt-4 space-y-3">
              {data?.reliability_events.length ? (
                data.reliability_events.map((item) => (
                  <div key={item.kind} className="flex justify-between text-sm">
                    <span className="text-textSecondary">{item.kind}</span>
                    <span className="font-medium text-textPrimary">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No reliability events logged.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Low-Rated Conversations</h3>
            <div className="mt-4 space-y-3">
              {data?.low_rated_conversations.length ? (
                data.low_rated_conversations.map((item, index) => (
                  <div key={`${item.conversation_public_id}-${index}`} className="rounded-sm border border-border p-3 text-sm">
                    <div className="font-medium text-textPrimary">{item.conversation_public_id || "unknown"}</div>
                    <div className="text-textMuted">{item.reason || "No reason provided"}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No low-rated conversations.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-textPrimary">Recent Reliability Events</h3>
            <div className="mt-4 space-y-3">
              {data?.recent_reliability_events.length ? (
                data.recent_reliability_events.map((item) => (
                  <div key={`${item.message_public_id}-${item.kind}`} className="rounded-sm border border-border p-3 text-sm">
                    <div className="font-medium text-textPrimary">{item.kind}</div>
                    <div className="text-textMuted">{item.conversation_public_id || "unknown conversation"}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-textMuted">No recent reliability events.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

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
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] text-text">Assistant Quality</h2>
          <p className="text-text-2">Conversation quality, tool reliability, policy gaps, and usage.</p>
        </div>
        {message ? <div className="text-sm text-danger">{message}</div> : null}
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ["Conversations", data?.metrics.conversations ?? 0],
            ["Messages", data?.metrics.messages ?? 0],
            ["Feedback", data?.metrics.feedback_count ?? 0],
            ["Thumbs Down", data?.metrics.thumbs_down_rate ?? 0],
          ].map(([label, value]) => (
            <Card key={label} className="p-4">
              <div className="text-sm text-text-3">{label}</div>
              <div className="mt-2 text-[22px] font-semibold tracking-[-0.02em] text-text">{value}</div>
            </Card>
          ))}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <h3 className="text-sm font-semibold text-text">Usage by Persona</h3>
            <div className="mt-4 space-y-3">
              {data?.usage_by_persona.length ? (
                data.usage_by_persona.map((item) => (
                  <div key={item.audience} className="flex justify-between text-sm">
                    <span className="text-text-2">{item.audience}</span>
                    <span className="font-medium text-text">{item.conversations}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No usage yet.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text">Missing Policies</h3>
            <div className="mt-4 space-y-3">
              {data?.missing_policy_categories.length ? (
                data.missing_policy_categories.map((item) => (
                  <div key={item.category} className="flex justify-between text-sm">
                    <span className="text-text-2">{item.category}</span>
                    <span className="font-medium text-text">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No policy gaps logged.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text">Tool Failures</h3>
            <div className="mt-4 space-y-3">
              {data?.tool_failure_rates.length ? (
                data.tool_failure_rates.map((item) => (
                  <div key={item.tool} className="flex justify-between text-sm">
                    <span className="text-text-2">{item.tool}</span>
                    <span className="font-medium text-text">{item.failures}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No tool failures logged.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text">Reliability Events</h3>
            <div className="mt-4 space-y-3">
              {data?.reliability_events.length ? (
                data.reliability_events.map((item) => (
                  <div key={item.kind} className="flex justify-between text-sm">
                    <span className="text-text-2">{item.kind}</span>
                    <span className="font-medium text-text">{item.count}</span>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No reliability events logged.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text">Low-Rated Conversations</h3>
            <div className="mt-4 space-y-3">
              {data?.low_rated_conversations.length ? (
                data.low_rated_conversations.map((item, index) => (
                  <div key={`${item.conversation_public_id}-${index}`} className="rounded-sm border border-line p-3 text-sm">
                    <div className="font-medium text-text">{item.conversation_public_id || "unknown"}</div>
                    <div className="text-text-3">{item.reason || "No reason provided"}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No low-rated conversations.</div>
              )}
            </div>
          </Card>
          <Card>
            <h3 className="text-sm font-semibold text-text">Recent Reliability Events</h3>
            <div className="mt-4 space-y-3">
              {data?.recent_reliability_events.length ? (
                data.recent_reliability_events.map((item) => (
                  <div key={`${item.message_public_id}-${item.kind}`} className="rounded-sm border border-line p-3 text-sm">
                    <div className="font-medium text-text">{item.kind}</div>
                    <div className="text-text-3">{item.conversation_public_id || "unknown conversation"}</div>
                  </div>
                ))
              ) : (
                <div className="text-sm text-text-3">No recent reliability events.</div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}

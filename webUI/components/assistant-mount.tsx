"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Bot, ExternalLink, MessageCircle, Send, X } from "lucide-react";

import { useAssistant } from "@/hooks/useAssistant";
import type { AssistantCitation, AssistantMessage, AssistantProposal } from "@/lib/assistantTypes";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

function CitationChips({ citations }: { citations: AssistantCitation[] }) {
  if (!citations.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {citations.map((citation) => (
        <Link
          key={`${citation.type}-${citation.id}-${citation.url}`}
          href={citation.url}
          className="inline-flex items-center gap-1 rounded-sm border border-border bg-white px-2 py-1 text-xs text-textSecondary hover:bg-surface2"
        >
          {citation.title || citation.type}
          <ExternalLink className="h-3 w-3" />
        </Link>
      ))}
    </div>
  );
}

function ProposalCard({
  proposal,
  guestId,
  onHandled,
}: {
  proposal: AssistantProposal;
  guestId: string;
  onHandled: (proposalId: string, status: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const expired = new Date(proposal.expires_at).getTime() < Date.now();
  const disabled = busy || expired || proposal.status !== "pending";

  async function act(action: "confirm" | "dismiss") {
    setBusy(true);
    setMessage("");
    try {
      const token = getAccessToken() ?? undefined;
      const result = await apiFetch<{ status: string }>(
        `/api/assistant/proposals/${proposal.proposal_id}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({ guest_id: guestId }),
        },
        token,
      );
      onHandled(proposal.proposal_id, result.status);
      setMessage(result.status);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-md border border-border bg-white p-3">
      <div className="text-sm font-semibold text-textPrimary">{proposal.summary}</div>
      <div className="mt-1 text-xs text-textMuted">{proposal.kind}</div>
      {proposal.warnings.length ? (
        <div className="mt-2 space-y-1 text-xs text-warning">
          {proposal.warnings.map((warning) => (
            <div key={warning}>{warning}</div>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Button size="sm" disabled={disabled} onClick={() => act("confirm")}>
          Confirm
        </Button>
        <Button size="sm" variant="secondary" disabled={disabled} onClick={() => act("dismiss")}>
          Dismiss
        </Button>
      </div>
      {expired ? <div className="mt-2 text-xs text-error">This proposal has expired.</div> : null}
      {message ? <div className="mt-2 text-xs text-textMuted">{message}</div> : null}
    </div>
  );
}

function MessageBubble({
  message,
  guestId,
  onProposalHandled,
}: {
  message: AssistantMessage;
  guestId: string;
  onProposalHandled: (proposalId: string, status: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-md px-3 py-2 text-sm ${
          isUser ? "bg-accent text-white" : "border border-border bg-surface text-textPrimary"
        }`}
      >
        <div className="whitespace-pre-wrap">{message.content}</div>
        {!isUser ? <CitationChips citations={message.citations} /> : null}
        {!isUser
          ? message.proposals.map((proposal) => (
              <ProposalCard
                key={proposal.proposal_id}
                proposal={proposal}
                guestId={guestId}
                onHandled={onProposalHandled}
              />
            ))
          : null}
      </div>
    </div>
  );
}

export function AssistantMount() {
  const { enabled, loading, error, messages, conversationId, guestId, send, setMessages } = useAssistant();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [escalating, setEscalating] = useState(false);

  if (!enabled) return null;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = input;
    setInput("");
    send(value).catch(() => null);
  }

  function onProposalHandled(proposalId: string, status: string) {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        proposals: message.proposals.map((proposal) =>
          proposal.proposal_id === proposalId ? { ...proposal, status } : proposal,
        ),
      })),
    );
  }

  async function escalate() {
    if (!conversationId) {
      await send("Talk to a human");
      return;
    }
    setEscalating(true);
    try {
      const token = getAccessToken() ?? undefined;
      await apiFetch(`/api/assistant/conversations/${conversationId}/escalate`, {
        method: "POST",
        body: JSON.stringify({ guest_id: guestId, subject: "Assistant escalation" }),
      }, token);
      setMessages((current) => [
        ...current,
        {
          public_id: `ticket_${Date.now()}`,
          role: "assistant",
          content: "A support ticket was created with this conversation transcript.",
          citations: [{ type: "support", id: "ticket", url: "/support", title: "Support ticket" }],
          proposals: [],
        },
      ]);
    } finally {
      setEscalating(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <Card className="flex h-[560px] w-[min(420px,calc(100vw-2rem))] flex-col p-0 shadow-xl">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-textPrimary">
              <Bot className="h-4 w-4" />
              Assistant
            </div>
            <button
              type="button"
              className="rounded-sm p-1 text-textMuted hover:bg-surface2"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {messages.length ? (
              messages.map((message) => (
                <MessageBubble
                  key={message.public_id}
                  message={message}
                  guestId={guestId}
                  onProposalHandled={onProposalHandled}
                />
              ))
            ) : (
              <div className="rounded-md border border-border bg-surface2 p-3 text-sm text-textSecondary">
                Ask about spaces, policies, bookings, billing, or support.
              </div>
            )}
            {error ? <div className="text-xs text-error">{error}</div> : null}
          </div>
          <div className="border-t border-border p-3">
            <button
              type="button"
              onClick={escalate}
              disabled={escalating}
              className="mb-2 text-xs font-medium text-accent hover:underline disabled:opacity-50"
            >
              Talk to a Human
            </button>
            <form className="flex gap-2" onSubmit={handleSubmit}>
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask PriddySpaces..."
                className="min-w-0 flex-1 rounded-sm border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
              />
              <Button type="submit" size="sm" disabled={loading || !input.trim()} aria-label="Send assistant message">
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </Card>
      ) : (
        <Button className="h-12 w-12 rounded-full p-0 shadow-lg" onClick={() => setOpen(true)} aria-label="Open assistant">
          <MessageCircle className="h-5 w-5" />
        </Button>
      )}
    </div>
  );
}

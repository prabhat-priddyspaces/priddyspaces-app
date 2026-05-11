"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { assistantStream } from "@/lib/assistantStream";
import type { AssistantChatResponse, AssistantMessage, AssistantStatus } from "@/lib/assistantTypes";
import { apiFetch } from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const GUEST_KEY = "priddyspaces_assistant_guest_id";

function getGuestId() {
  if (typeof window === "undefined") return "";
  const existing = window.localStorage.getItem(GUEST_KEY);
  if (existing) return existing;
  const created = `guest_${crypto.randomUUID()}`;
  window.localStorage.setItem(GUEST_KEY, created);
  return created;
}

export function useAssistant() {
  const pathname = usePathname();
  const [status, setStatus] = useState<AssistantStatus | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AssistantMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const guestId = useMemo(getGuestId, []);

  const hiddenRoute =
    pathname?.startsWith("/sign-in") ||
    pathname?.startsWith("/sign-up") ||
    pathname?.startsWith("/login") ||
    pathname?.startsWith("/register") ||
    pathname?.startsWith("/onboarding") ||
    pathname?.startsWith("/auth");

  useEffect(() => {
    apiFetch<AssistantStatus>("/api/assistant/status", { method: "GET" })
      .then(setStatus)
      .catch(() => setStatus({ enabled: false, primary_model: "", summary_model: "" }));
  }, []);

  async function send(message: string, pageContext: Record<string, unknown> = {}) {
    const trimmed = message.trim();
    if (!trimmed) return;
    setError("");
    setLoading(true);
    const optimistic: AssistantMessage = {
      public_id: `local_${Date.now()}`,
      role: "user",
      content: trimmed,
      citations: [],
      proposals: [],
    };
    setMessages((current) => [...current, optimistic]);
    try {
      const token = getAccessToken();
      const response = await assistantStream(
        {
          message: trimmed,
          conversation_public_id: conversationId,
          guest_id: guestId,
          page_context: { ...pageContext, pathname },
        },
        token,
      );
      applyResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assistant request failed");
    } finally {
      setLoading(false);
    }
  }

  function applyResponse(response: AssistantChatResponse) {
    if (response.conversation_public_id) setConversationId(response.conversation_public_id);
    if (response.guest_id && typeof window !== "undefined") {
      window.localStorage.setItem(GUEST_KEY, response.guest_id);
    }
    if (response.message) {
      setMessages((current) => [...current, response.message as AssistantMessage]);
    } else if (response.disabled_reason) {
      setMessages((current) => [
        ...current,
        {
          public_id: `disabled_${Date.now()}`,
          role: "assistant",
          content: response.disabled_reason || "Assistant unavailable",
          citations: [],
          proposals: [],
        },
      ]);
    }
  }

  return {
    enabled: Boolean(status?.enabled) && !hiddenRoute,
    loading,
    error,
    messages,
    conversationId,
    guestId,
    send,
    setMessages,
  };
}

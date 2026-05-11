import { API_BASE_URL } from "../constants";

export type AssistantCitation = {
  type: string;
  id: string;
  url: string;
  title?: string | null;
};

export type AssistantProposal = {
  proposal_id: string;
  kind: string;
  summary: string;
  warnings: string[];
  expires_at: string;
  status: string;
};

export type AssistantMessage = {
  public_id: string;
  role: string;
  content: string;
  citations: AssistantCitation[];
  proposals: AssistantProposal[];
};

export type AssistantChatResponse = {
  enabled: boolean;
  disabled_reason?: string | null;
  conversation_public_id?: string | null;
  guest_id?: string | null;
  message?: AssistantMessage | null;
};

export function parseAssistantSse(text: string): AssistantChatResponse | null {
  const chunks = text.split("\n\n");
  for (const chunk of chunks) {
    if (!chunk.includes("event: message")) continue;
    const data = chunk
      .split("\n")
      .find((line) => line.startsWith("data:"))
      ?.replace(/^data:\s*/, "");
    if (!data) continue;
    return JSON.parse(data) as AssistantChatResponse;
  }
  return null;
}

export async function sendAssistantMessage({
  token,
  message,
  conversationId,
}: {
  token: string;
  message: string;
  conversationId?: string | null;
}): Promise<AssistantChatResponse> {
  const res = await fetch(`${API_BASE_URL}/api/assistant/chat?stream=true`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      conversation_public_id: conversationId,
      page_context: { platform: "mobile" },
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(text || "Assistant request failed");
  const parsed = parseAssistantSse(text);
  if (parsed) return parsed;
  return JSON.parse(text) as AssistantChatResponse;
}

export async function confirmAssistantProposal(token: string, proposalId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/assistant/proposals/${proposalId}/confirm`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error((await res.text()) || "Proposal confirmation failed");
  return res.json();
}

export async function dismissAssistantProposal(token: string, proposalId: string): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/api/assistant/proposals/${proposalId}/dismiss`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error((await res.text()) || "Proposal dismiss failed");
  return res.json();
}

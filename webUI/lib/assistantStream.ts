import { API_BASE_URL } from "@/lib/api";
import type { AssistantChatResponse } from "@/lib/assistantTypes";

export async function assistantStream(
  payload: Record<string, unknown>,
  token?: string | null,
  onMessage?: (response: AssistantChatResponse) => void,
): Promise<AssistantChatResponse> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE_URL}/api/assistant/chat?stream=true`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Assistant request failed");
  }
  if (!res.body) {
    return res.json();
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let last: AssistantChatResponse | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";
    for (const chunk of chunks) {
      const eventLine = chunk.split("\n").find((line) => line.startsWith("event:"));
      const dataLine = chunk.split("\n").find((line) => line.startsWith("data:"));
      if (!dataLine || eventLine?.includes("done")) continue;
      const parsed = JSON.parse(dataLine.replace(/^data:\s*/, "")) as AssistantChatResponse;
      last = parsed;
      onMessage?.(parsed);
    }
  }

  if (!last) throw new Error("Assistant stream ended without a message");
  return last;
}

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { assistantStream } from "../lib/assistantStream";
import { AssistantMount } from "../components/assistant-mount";

const useAssistantMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useAssistant", () => ({
  useAssistant: useAssistantMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => null),
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    apiFetch: vi.fn(() => Promise.resolve({ status: "dismissed" })),
  };
});

describe("assistant stream", () => {
  it("parses assistant SSE message events", async () => {
    const encoder = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(
                encoder.encode(
                  'event: message\ndata: {"enabled":true,"conversation_public_id":"conv_1","guest_id":"guest_1","message":{"public_id":"msg_1","role":"assistant","content":"Hi","citations":[],"proposals":[]},"rate_limited":false,"cost_capped":false}\n\n',
                ),
              );
              controller.enqueue(encoder.encode("event: done\ndata: {}\n\n"));
              controller.close();
            },
          }),
        }),
      ),
    );

    const response = await assistantStream({ message: "hello" });

    expect(response.conversation_public_id).toBe("conv_1");
    expect(response.message?.content).toBe("Hi");
  });
});

describe("AssistantMount", () => {
  beforeEach(() => {
    useAssistantMock.mockReturnValue({
      enabled: true,
      loading: false,
      error: "",
      messages: [
        {
          public_id: "msg_1",
          role: "assistant",
          content: "Review this proposal.",
          citations: [{ type: "space", id: "space_1", url: "/spaces/space_1", title: "Space" }],
          proposals: [
            {
              proposal_id: "prop_1",
              kind: "support.escalate",
              summary: "Talk to a human",
              endpoint: { method: "POST", path: "/api/assistant/support-tickets" },
              payload: {},
              warnings: [],
              expires_at: new Date(Date.now() + 60_000).toISOString(),
              status: "pending",
            },
          ],
        },
      ],
      conversationId: "conv_1",
      guestId: "guest_1",
      send: vi.fn(),
      setMessages: vi.fn(),
    });
  });

  it("renders citations and proposal controls", () => {
    render(<AssistantMount />);

    fireEvent.click(screen.getByLabelText("Open assistant"));

    expect(screen.getByText("Review this proposal.")).toBeInTheDocument();
    expect(screen.getByText("Space")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Space/ })).toHaveAttribute(
      "href",
      "/spaces/_.html?id=space_1&back=%2Fcoworking",
    );
    expect(screen.getByText("Talk to a human")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });
});

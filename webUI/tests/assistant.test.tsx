import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { assistantStream } from "../lib/assistantStream";
import { AssistantMount } from "../components/assistant-mount";

const useAssistantMock = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const setMessagesMock = vi.hoisted(() => vi.fn());
const reverseGeocodeMock = vi.hoisted(() => vi.fn());

vi.mock("../hooks/useAssistant", () => ({
  useAssistant: useAssistantMock,
}));

vi.mock("@/components/use-address-autocomplete", () => ({
  reverseGeocode: reverseGeocodeMock,
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => null),
  getActiveImpersonationToken: vi.fn(() => null),
  getValidAccessToken: vi.fn((token: string | null | undefined = null) => Promise.resolve(token ?? null)),
  isImpersonationToken: vi.fn(() => false),
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
                  'event: message\ndata: {"enabled":true,"conversation_public_id":"conv_1","guest_id":"guest_1","message":{"public_id":"msg_1","role":"assistant","content":"Hi","citations":[],"proposals":[],"client_actions":[]},"rate_limited":false,"cost_capped":false}\n\n',
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
    sendMock.mockReset();
    setMessagesMock.mockReset();
    reverseGeocodeMock.mockReset();
    useAssistantMock.mockReturnValue({
      enabled: true,
      loading: false,
      error: "",
      messages: [
        {
          public_id: "msg_1",
          role: "assistant",
          content: "Review this proposal.",
          citations: [
            { type: "space", id: "space_1", url: "/spaces/space_1", title: "Space" },
            {
              type: "location",
              id: "loc_1",
              url: "/meeting-rooms/_.html?id=loc_1&lat=26.132029&lng=-80.262418&radius_miles=50",
              title: "Legacy room",
            },
          ],
          client_actions: [],
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
      send: sendMock,
      setMessages: setMessagesMock,
    });
  });

  it("renders citations and proposal controls", () => {
    render(<AssistantMount />);

    fireEvent.click(screen.getByLabelText("Open assistant"));

    expect(screen.getByText("Review this proposal.")).toBeInTheDocument();
    expect(screen.getByText("Space")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Space/ })).toHaveAttribute(
      "href",
      "/spaces/space_1",
    );
    expect(screen.getByRole("link", { name: /Legacy room/ })).toHaveAttribute(
      "href",
      "/locations/loc_1?route=meeting-rooms&lat=26.132029&lng=-80.262418&radius_miles=50",
    );
    expect(screen.getByText("Talk to a human")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirm" })).toBeInTheDocument();
  });

  it("opens from dashboard events and pre-fills the suggested question", () => {
    render(<AssistantMount />);

    act(() => {
      window.dispatchEvent(
        new CustomEvent("priddyspaces:assistant-open", {
          detail: { prefill: "What should I prioritize today?" },
        }),
      );
    });

    expect(screen.getByText("Assistant")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Ask PriddySpaces...")).toHaveValue(
      "What should I prioritize today?",
    );
  });

  it("requests browser geolocation from request_location actions and resends the original query", async () => {
    reverseGeocodeMock.mockResolvedValue({ city: "Plantation", state: "FL", formatted: "Plantation, FL" });
    const getCurrentPosition = vi.fn((success: PositionCallback) =>
      success({
        coords: { latitude: 26.132, longitude: -80.2624 },
      } as GeolocationPosition),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    useAssistantMock.mockReturnValue({
      enabled: true,
      loading: false,
      error: "",
      messages: [
        {
          public_id: "msg_location",
          role: "assistant",
          content: "I need your location to search within 50 miles.",
          citations: [],
          proposals: [],
          client_actions: [
            {
              action_id: "act_1",
              kind: "request_location",
              label: "Use my location",
              payload: {
                original_message: "show me cheapest meeting room near me",
                radius_miles: 50,
              },
            },
          ],
        },
      ],
      conversationId: "conv_1",
      guestId: "guest_1",
      send: sendMock,
      setMessages: setMessagesMock,
    });

    render(<AssistantMount />);
    fireEvent.click(screen.getByLabelText("Open assistant"));
    fireEvent.click(screen.getByRole("button", { name: /Use my location/ }));

    await waitFor(() => {
      expect(getCurrentPosition).toHaveBeenCalled();
      expect(sendMock).toHaveBeenCalledWith(
        "show me cheapest meeting room near me",
        expect.objectContaining({
          lat: 26.132,
          lng: -80.2624,
          location_label: "Plantation, FL",
          radius_miles: 50,
          source: "browser",
        }),
      );
    });
  });

  it("shows a city or ZIP fallback when location permission is denied", async () => {
    const getCurrentPosition = vi.fn((_success: PositionCallback, error: PositionErrorCallback) =>
      error({ code: 1, message: "denied", PERMISSION_DENIED: 1 } as GeolocationPositionError),
    );
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition },
      configurable: true,
    });
    useAssistantMock.mockReturnValue({
      enabled: true,
      loading: false,
      error: "",
      messages: [
        {
          public_id: "msg_location",
          role: "assistant",
          content: "I need your location to search within 50 miles.",
          citations: [],
          proposals: [],
          client_actions: [
            {
              action_id: "act_1",
              kind: "request_location",
              label: "Use my location",
              payload: {
                original_message: "meeting room near me",
                radius_miles: 50,
              },
            },
          ],
        },
      ],
      conversationId: "conv_1",
      guestId: "guest_1",
      send: sendMock,
      setMessages: setMessagesMock,
    });

    render(<AssistantMount />);
    fireEvent.click(screen.getByLabelText("Open assistant"));
    fireEvent.click(screen.getByRole("button", { name: /Use my location/ }));

    await waitFor(() => expect(setMessagesMock).toHaveBeenCalled());
    const updater = setMessagesMock.mock.calls[0][0] as (messages: unknown[]) => Array<{ content: string }>;
    expect(updater([])[0].content).toContain("city or ZIP");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("renders clarify_input actions and appends the clarification prompt", async () => {
    useAssistantMock.mockReturnValue({
      enabled: true,
      loading: false,
      error: "",
      messages: [
        {
          public_id: "msg_clarify",
          role: "assistant",
          content: "I need more details.",
          citations: [],
          proposals: [],
          client_actions: [
            {
              action_id: "act_clarify",
              kind: "clarify_input",
              label: "Add booking details",
              payload: {
                prompt: "Choose a space, start time, and end time.",
                original_message: "book a meeting room",
              },
            },
          ],
        },
      ],
      conversationId: "conv_1",
      guestId: "guest_1",
      send: sendMock,
      setMessages: setMessagesMock,
    });

    render(<AssistantMount />);
    fireEvent.click(screen.getByLabelText("Open assistant"));
    fireEvent.click(screen.getByRole("button", { name: /Add booking details/ }));

    expect(setMessagesMock).toHaveBeenCalled();
    const updater = setMessagesMock.mock.calls[0][0] as (messages: unknown[]) => Array<{ content: string }>;
    expect(updater([])[0].content).toBe("Choose a space, start time, and end time.");
  });
});

import { act, renderHook, waitFor } from "@testing-library/react";
import { vi } from "vitest";

import { useAssistant } from "../hooks/useAssistant";

const assistantStreamMock = vi.hoisted(() => vi.fn());
const apiFetchMock = vi.hoisted(() => vi.fn());
const usePathnameMock = vi.hoisted(() => vi.fn(() => "/spaces"));

vi.mock("../lib/assistantStream", () => ({
  assistantStream: assistantStreamMock,
}));

vi.mock("../lib/api", async () => {
  const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
  return {
    ...actual,
    apiFetch: apiFetchMock,
  };
});

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => null),
}));

vi.mock("next/navigation", () => ({
  usePathname: usePathnameMock,
}));

describe("useAssistant", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/spaces?q=Plantation%2C+FL&lat=26.1320&lng=-80.2624&radius_miles=50");
    const storage = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      value: {
        getItem: vi.fn((key: string) => storage.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
        removeItem: vi.fn((key: string) => storage.delete(key)),
        clear: vi.fn(() => storage.clear()),
      },
      configurable: true,
    });
    assistantStreamMock.mockReset();
    apiFetchMock.mockReset();
    apiFetchMock.mockResolvedValue({ enabled: true, primary_model: "gpt-4o", summary_model: "gpt-4o-mini" });
    assistantStreamMock.mockResolvedValue({
      enabled: true,
      conversation_public_id: "conv_1",
      guest_id: "guest_1",
      message: {
        public_id: "msg_1",
        role: "assistant",
        content: "ok",
        citations: [],
        proposals: [],
        client_actions: [],
      },
      rate_limited: false,
      cost_capped: false,
    });
  });

  it("includes current marketplace URL location filters in assistant page_context", async () => {
    const { result } = renderHook(() => useAssistant());

    await waitFor(() => expect(result.current.enabled).toBe(true));
    await act(async () => {
      await result.current.send("show me cheapest meeting room");
    });

    expect(assistantStreamMock).toHaveBeenCalledWith(
      expect.objectContaining({
        page_context: expect.objectContaining({
          pathname: "/spaces",
          q: "Plantation, FL",
          location_label: "Plantation, FL",
          lat: 26.132,
          lng: -80.2624,
          radius_miles: 50,
        }),
      }),
      null,
    );
  });
});

import React from "react";
import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import AssistantQualityPage from "../app/admin/assistant-quality/page";

vi.mock("../lib/api", () => ({
  apiFetch: vi.fn((path: string) => {
    if (path === "/api/me") {
      return Promise.resolve({
        email: "admin@example.com",
        platform_role: "superadmin",
        impersonation: {
          is_impersonating: false,
          actor_public_id: null,
          actor_email: null,
          actor_platform_role: null,
          target_public_id: null,
          target_email: null,
          reason: null,
        },
      });
    }
    return Promise.resolve({
      metrics: {
        conversations: 2,
        messages: 5,
        feedback_count: 1,
        thumbs_down_rate: 0,
      },
      low_rated_conversations: [],
      missing_policy_categories: [],
      reliability_events: [{ kind: "context_mismatch", count: 3 }],
      recent_reliability_events: [
        {
          kind: "missing_required_slot",
          conversation_public_id: "conv_1",
          message_public_id: "msg_1",
          details: {},
        },
      ],
      tool_failure_rates: [],
      usage_by_persona: [],
      abandoned_booking_drafts: [],
    });
  }),
}));

vi.mock("../lib/auth", () => ({
  getAccessToken: vi.fn(() => "token"),
  getActiveImpersonationToken: vi.fn(() => null),
}));

describe("AssistantQualityPage", () => {
  it("renders reliability event aggregates and recent events", async () => {
    render(<AssistantQualityPage />);

    expect(await screen.findByText("Reliability Events")).toBeInTheDocument();
    expect(screen.getByText("context_mismatch")).toBeInTheDocument();
    expect(screen.getByText("Recent Reliability Events")).toBeInTheDocument();
    expect(screen.getByText("missing_required_slot")).toBeInTheDocument();
  });
});

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingWorkflowsScreen } from "../src/screens/owner/OwnerMarketingWorkflowsScreen";
import { apiFetch } from "../src/lib/api";

let mockRouteParams: Record<string, unknown> = {};

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ token: "token" }),
}));

jest.mock("@react-navigation/native", () => ({
  useRoute: () => ({ params: mockRouteParams }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const workflow = {
  public_id: "wf_1",
  name: "Winback",
  status: "draft",
  graph: { nodes: [], edges: [] },
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/marketing/workflows?")) return Promise.resolve([workflow]);
    if (path.startsWith("/api/marketing/templates?")) {
      return Promise.resolve([{ public_id: "tpl_1", name: "Newsletter" }]);
    }
    if (path.startsWith("/api/marketing/segments?")) {
      return Promise.resolve([{ public_id: "seg_1", name: "Churn risk" }]);
    }
    if (path === "/api/marketing/workflows" && method === "POST") return Promise.resolve(workflow);
    if (path === "/api/marketing/workflows/wf_1/runs") {
      return Promise.resolve([
        {
          public_id: "run_1",
          user_public_id: "user_1",
          status: "waiting",
          current_node_id: "wait-1",
          next_run_at: "2026-06-12T09:00:00Z",
        },
      ]);
    }
    if (path === "/api/marketing/workflows/wf_1/activate" && method === "POST") {
      return Promise.resolve({ ...workflow, status: "active" });
    }
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingWorkflowsScreen", () => {
  beforeEach(() => {
    mockRouteParams = { orgId: "org_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("builds a linear graph with web's node defaults and saves", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingWorkflowsScreen />);

    await waitFor(() => expect(getByText("Winback")).toBeTruthy());
    fireEvent.changeText(getByLabelText("Workflow name"), "Welcome drip");
    fireEvent.press(getByLabelText("Add wait"));
    fireEvent.press(getByLabelText("Add send_email"));
    fireEvent.press(getByLabelText("Save workflow"));

    await waitFor(() => expect(getByText("Workflow saved")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/workflows" && options?.method === "POST",
    );
    const body = JSON.parse(postCall[1].body);
    expect(body.organization_public_id).toBe("org_1");
    expect(body.name).toBe("Welcome drip");
    expect(body.graph.nodes.map((n: { id: string }) => n.id)).toEqual([
      "trigger",
      "wait-1",
      "send_email-2",
      "stop",
    ]);
    expect(body.graph.nodes[0].data).toMatchObject({
      trigger: "segment_entry",
      segment_public_id: "seg_1",
    });
    expect(body.graph.nodes[1].data).toMatchObject({ kind: "wait", amount: 1, unit: "days" });
    expect(body.graph.nodes[2].data).toMatchObject({
      kind: "send_email",
      template_public_id: "tpl_1",
      sender_lane: "shared",
    });
    expect(body.graph.edges).toEqual([
      { id: "trigger-wait-1", source: "trigger", target: "wait-1" },
      { id: "wait-1-send_email-2", source: "wait-1", target: "send_email-2" },
      { id: "send_email-2-stop", source: "send_email-2", target: "stop" },
    ]);
  });

  it("selects a workflow, shows runs, and activates it", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingWorkflowsScreen />);

    await waitFor(() => expect(getByLabelText("Edit workflow Winback")).toBeTruthy());
    fireEvent.press(getByLabelText("Edit workflow Winback"));

    await waitFor(() => expect(getByText("user_1")).toBeTruthy());
    fireEvent.press(getByLabelText("Activate"));
    await waitFor(() => expect(getByText("Workflow activated")).toBeTruthy());
    expect(
      (apiFetch as jest.Mock).mock.calls.some(
        ([path, options]) => path === "/api/marketing/workflows/wf_1/activate" && options?.method === "POST",
      ),
    ).toBe(true);
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load workflows"));
    });

    const { getByText } = render(<OwnerMarketingWorkflowsScreen />);

    await waitFor(() => expect(getByText("Failed to load workflows")).toBeTruthy());
  });
});

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { OwnerMarketingTemplatesScreen } from "../src/screens/owner/OwnerMarketingTemplatesScreen";
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

const template = {
  public_id: "tpl_1",
  name: "Newsletter",
  subject: "Hello {{ member.first_name }}",
  html_body: "<p>Hi</p>",
  text_body: "Hi",
  category: "general",
  variables: ["member.first_name"],
  is_archived: false,
};

function mockApi() {
  (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
    const method = options?.method || "GET";
    if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
    if (path.startsWith("/api/marketing/templates?")) return Promise.resolve([template]);
    if (path === "/api/marketing/templates" && method === "POST") return Promise.resolve(template);
    if (path === "/api/marketing/templates/tpl_1" && method === "PUT") return Promise.resolve(template);
    if (path === "/api/marketing/templates/tpl_1/preview" && method === "POST") {
      return Promise.resolve({
        subject: "Hello Casey",
        html_body: null,
        text_body: "Hi Casey",
        missing_values: ["booking.number"],
      });
    }
    if (path === "/api/marketing/templates/tpl_1/test-send" && method === "POST") return Promise.resolve({});
    return Promise.resolve([]);
  });
}

describe("OwnerMarketingTemplatesScreen", () => {
  beforeEach(() => {
    mockRouteParams = { orgId: "org_1" };
    (apiFetch as jest.Mock).mockReset();
  });

  it("edits a template, appends shortcodes, and saves via PUT", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingTemplatesScreen />);

    await waitFor(() => expect(getByLabelText("Edit template Newsletter")).toBeTruthy());
    fireEvent.press(getByLabelText("Edit template Newsletter"));
    expect(getByLabelText("HTML body").props.value).toBe("<p>Hi</p>");

    fireEvent.press(getByLabelText("Edit text body"));
    fireEvent.press(getByLabelText("Insert {{ member.email }}"));
    expect(getByLabelText("Text body").props.value).toBe("Hi{{ member.email }}");

    fireEvent.press(getByLabelText("Save template"));
    await waitFor(() => expect(getByText("Template saved")).toBeTruthy());
    const putCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/templates/tpl_1" && options?.method === "PUT",
    );
    expect(JSON.parse(putCall[1].body)).toMatchObject({
      name: "Newsletter",
      text_body: "Hi{{ member.email }}",
    });
  });

  it("creates a new template with the org id", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingTemplatesScreen />);

    await waitFor(() => expect(getByLabelText("New template")).toBeTruthy());
    fireEvent.press(getByLabelText("New template"));
    fireEvent.changeText(getByLabelText("Template name"), "Welcome");
    fireEvent.changeText(getByLabelText("Subject"), "Welcome!");
    fireEvent.press(getByLabelText("Save template"));

    await waitFor(() => expect(getByText("Template saved")).toBeTruthy());
    const postCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/marketing/templates" && options?.method === "POST",
    );
    expect(JSON.parse(postCall[1].body)).toMatchObject({
      organization_public_id: "org_1",
      name: "Welcome",
      subject: "Welcome!",
    });
  });

  it("previews and test-sends a selected template", async () => {
    mockApi();
    const { getByLabelText, getByText } = render(<OwnerMarketingTemplatesScreen />);

    await waitFor(() => expect(getByLabelText("Edit template Newsletter")).toBeTruthy());
    fireEvent.press(getByLabelText("Edit template Newsletter"));
    fireEvent.press(getByLabelText("Preview template"));

    await waitFor(() => expect(getByText("Hello Casey")).toBeTruthy());
    expect(getByText("booking.number")).toBeTruthy();

    fireEvent.changeText(getByLabelText("Test email (optional)"), "owner@test.com");
    fireEvent.press(getByLabelText("Test send"));
    await waitFor(() => expect(getByText("Test send queued")).toBeTruthy());
    const testCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) =>
        path === "/api/marketing/templates/tpl_1/test-send" && options?.method === "POST",
    );
    expect(JSON.parse(testCall[1].body)).toEqual({
      organization_public_id: "org_1",
      to_email: "owner@test.com",
    });
  });

  it("surfaces load errors", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string) => {
      if (path === "/api/orgs") return Promise.resolve([{ public_id: "org_1", name: "Priddyspaces" }]);
      return Promise.reject(new Error("Failed to load templates"));
    });

    const { getByText } = render(<OwnerMarketingTemplatesScreen />);

    await waitFor(() => expect(getByText("Failed to load templates")).toBeTruthy());
  });
});

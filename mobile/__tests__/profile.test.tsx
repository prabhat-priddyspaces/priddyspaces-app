import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { ProfileScreen } from "../src/screens/ProfileScreen";
import { apiFetch } from "../src/lib/api";

const mockNavigate = jest.fn();
const mockSignOut = jest.fn();

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    token: "token",
    me: { email: "customer@test.com", role: "member", platform_role: null },
    signOut: mockSignOut,
  }),
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

jest.mock("../src/lib/api", () => ({
  apiFetch: jest.fn(),
}));

const profile = {
  email: "customer@test.com",
  first_name: "Casey",
  last_name: "Member",
  phone: "5551234567",
  company_name: "Acme Corp",
};

describe("ProfileScreen", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
    mockSignOut.mockClear();
    (apiFetch as jest.Mock).mockReset();
  });

  it("loads the profile and prefills the form", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/me" && options?.method === "GET") return Promise.resolve(profile);
      return Promise.resolve({});
    });

    const { getByLabelText, getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByLabelText("First name").props.value).toBe("Casey"));
    expect(getByLabelText("Last name").props.value).toBe("Member");
    expect(getByLabelText("Phone").props.value).toBe("5551234567");
    expect(getByLabelText("Company name").props.value).toBe("Acme Corp");
    expect(getByText("customer@test.com")).toBeTruthy();
    expect(getByText("member")).toBeTruthy();
  });

  it("saves edited fields via PATCH /api/me", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/me" && options?.method === "GET") return Promise.resolve(profile);
      if (path === "/api/me" && options?.method === "PATCH") return Promise.resolve(profile);
      return Promise.resolve({});
    });

    const { getByLabelText, getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByLabelText("First name").props.value).toBe("Casey"));
    fireEvent.changeText(getByLabelText("First name"), "Jordan");
    fireEvent.changeText(getByLabelText("Company name"), "New Co");
    fireEvent.press(getByLabelText("Save profile"));

    await waitFor(() => expect(getByText("Profile saved")).toBeTruthy());
    const patchCall = (apiFetch as jest.Mock).mock.calls.find(
      ([path, options]) => path === "/api/me" && options?.method === "PATCH",
    );
    expect(JSON.parse(patchCall[1].body)).toMatchObject({
      first_name: "Jordan",
      last_name: "Member",
      phone: "5551234567",
      company_name: "New Co",
    });
  });

  it("sanitizes phone input to digits capped at 10", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/me" && options?.method === "GET") return Promise.resolve(profile);
      return Promise.resolve({});
    });

    const { getByLabelText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByLabelText("Phone").props.value).toBe("5551234567"));
    fireEvent.changeText(getByLabelText("Phone"), "(585) 555-0199 ext 42");
    expect(getByLabelText("Phone").props.value).toBe("5855550199");
  });

  it("shows an error when the profile fails to load", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/me" && options?.method === "GET") {
        return Promise.reject(new Error("Failed to load profile"));
      }
      return Promise.resolve({});
    });

    const { getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByText("Failed to load profile")).toBeTruthy());
  });

  it("shows an error when saving fails", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/me" && options?.method === "GET") return Promise.resolve(profile);
      if (path === "/api/me" && options?.method === "PATCH") {
        return Promise.reject(new Error("Save failed"));
      }
      return Promise.resolve({});
    });

    const { getByLabelText, getByText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByLabelText("First name").props.value).toBe("Casey"));
    fireEvent.press(getByLabelText("Save profile"));

    await waitFor(() => expect(getByText("Save failed")).toBeTruthy());
  });

  it("navigates to notification settings and signs out", async () => {
    (apiFetch as jest.Mock).mockImplementation((path: string, options?: RequestInit) => {
      if (path === "/api/me" && options?.method === "GET") return Promise.resolve(profile);
      return Promise.resolve({});
    });

    const { getByLabelText } = render(<ProfileScreen />);

    await waitFor(() => expect(getByLabelText("First name").props.value).toBe("Casey"));
    fireEvent.press(getByLabelText("Notification settings"));
    expect(mockNavigate).toHaveBeenCalledWith("Notifications");

    fireEvent.press(getByLabelText("Log out"));
    expect(mockSignOut).toHaveBeenCalled();
  });
});

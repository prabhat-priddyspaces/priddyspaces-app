import React from "react";
import { render } from "@testing-library/react-native";

import { MenuScreen } from "../src/screens/MenuScreen";

let mockMe = { role: "owner", platform_role: null as string | null };

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ me: mockMe, signOut: jest.fn() })
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() })
}));

describe("MenuScreen", () => {
  beforeEach(() => {
    mockMe = { role: "owner", platform_role: null };
  });

  it("renders owner menu", () => {
    const { getByText } = render(<MenuScreen />);
    expect(getByText("Menu")).toBeTruthy();
    expect(getByText("Dashboard")).toBeTruthy();
    expect(getByText("Scanner")).toBeTruthy();
    expect(getByText("Attendance")).toBeTruthy();
  });

  it("renders member access pass menu items", () => {
    mockMe = { role: "member", platform_role: null };
    const { getByText } = render(<MenuScreen />);
    expect(getByText("Access Passes")).toBeTruthy();
    expect(getByText("My Space QR")).toBeTruthy();
    expect(getByText("Directory")).toBeTruthy();
  });

  it("renders admin scanner and attendance menu items", () => {
    mockMe = { role: "owner", platform_role: "superadmin" };
    const { getByText, queryByText } = render(<MenuScreen />);
    expect(getByText("Scanner")).toBeTruthy();
    expect(getByText("Attendance")).toBeTruthy();
    expect(queryByText("Locations")).toBeNull();
  });
});

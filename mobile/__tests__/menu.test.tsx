import React from "react";
import { render } from "@testing-library/react-native";

import { MenuScreen } from "../src/screens/MenuScreen";

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({ me: { role: "owner" }, signOut: jest.fn() })
}));

jest.mock("@react-navigation/native", () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() })
}));

describe("MenuScreen", () => {
  it("renders owner menu", () => {
    const { getByText } = render(<MenuScreen />);
    expect(getByText("Menu")).toBeTruthy();
    expect(getByText("Dashboard")).toBeTruthy();
  });
});

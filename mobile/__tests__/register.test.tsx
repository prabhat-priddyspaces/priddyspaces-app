import React from "react";
import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

import { RegisterScreen } from "../src/screens/RegisterScreen";

const mockSignUp = jest.fn();
const mockVerifyEmailCode = jest.fn();

jest.mock("../src/context/AuthContext", () => ({
  useAuth: () => ({
    signUp: mockSignUp,
    verifyEmailCode: mockVerifyEmailCode,
    loading: false,
  }),
}));

describe("RegisterScreen", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, "alert").mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function fillRegistrationForm(screen: ReturnType<typeof render>) {
    fireEvent.changeText(screen.getByPlaceholderText("First name"), "Avery");
    fireEvent.changeText(screen.getByPlaceholderText("Last name"), "Member");
    fireEvent.changeText(screen.getByPlaceholderText("Email"), "avery@example.com");
    fireEvent.changeText(screen.getByPlaceholderText("Password"), "Password123!");
  }

  it("shows the email verification step when Clerk requires it", async () => {
    mockSignUp.mockResolvedValue({ status: "needs_verification" });

    const screen = render(<RegisterScreen />);
    fillRegistrationForm(screen);
    fireEvent.press(screen.getByText("Create account"));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        email: "avery@example.com",
        password: "Password123!",
        first_name: "Avery",
        last_name: "Member",
      });
    });

    expect(await screen.findByText("Verify your email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Verification code")).toBeTruthy();
  });

  it("submits the verification code to finish account creation", async () => {
    mockSignUp.mockResolvedValue({ status: "needs_verification" });
    mockVerifyEmailCode.mockResolvedValue(undefined);

    const screen = render(<RegisterScreen />);
    fillRegistrationForm(screen);
    fireEvent.press(screen.getByText("Create account"));

    const codeInput = await screen.findByPlaceholderText("Verification code");
    fireEvent.changeText(codeInput, "123456");
    fireEvent.press(screen.getByText("Verify email"));

    await waitFor(() => {
      expect(mockVerifyEmailCode).toHaveBeenCalledWith("123456");
    });
  });
});

import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClerkSignUpCard } from "../components/clerk-sign-up-card";

const signUpMock = vi.hoisted(() => vi.fn(() => null));

vi.mock("@clerk/nextjs", () => ({
  SignUp: signUpMock,
}));

describe("ClerkSignUpCard", () => {
  beforeEach(() => {
    signUpMock.mockClear();
  });

  it("routes member signups to member onboarding", () => {
    render(<ClerkSignUpCard />);

    expect(signUpMock.mock.calls[0][0]).toMatchObject({
      forceRedirectUrl: "/onboarding/member",
      fallbackRedirectUrl: "/onboarding/member",
      unsafeMetadata: { signup_role: "member" },
    });
  });

  it("routes owner signups to owner onboarding", () => {
    render(<ClerkSignUpCard owner />);

    expect(signUpMock.mock.calls[0][0]).toMatchObject({
      forceRedirectUrl: "/onboarding/owner",
      fallbackRedirectUrl: "/onboarding/owner",
      unsafeMetadata: { signup_role: "owner" },
    });
  });
});

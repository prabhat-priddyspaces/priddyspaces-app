import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClerkSignUpCard } from "../components/clerk-sign-up-card";

const signUpMock = vi.hoisted(() => vi.fn(() => null));
const searchParamsMock = vi.hoisted(() => ({
  value: new URLSearchParams(),
}));

vi.mock("@clerk/nextjs", () => ({
  SignUp: signUpMock,
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParamsMock.value,
}));

describe("ClerkSignUpCard", () => {
  beforeEach(() => {
    signUpMock.mockClear();
    searchParamsMock.value = new URLSearchParams();
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

  it("prefills invited owner email addresses", () => {
    searchParamsMock.value = new URLSearchParams("email=OwnerInvite%40Example.COM");

    render(<ClerkSignUpCard owner />);

    expect(signUpMock.mock.calls[0][0]).toMatchObject({
      initialValues: { emailAddress: "ownerinvite@example.com" },
    });
  });
});

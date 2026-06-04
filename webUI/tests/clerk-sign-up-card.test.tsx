import React from "react";
import { render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClerkSignUpCard } from "../components/clerk-sign-up-card";
import { consumeOauthNext } from "../lib/auth-redirect";

const signUpMock = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));
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
    window.sessionStorage.clear();
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

  it("stashes safe member registration redirects for onboarding", () => {
    searchParamsMock.value = new URLSearchParams(
      "email=member%40example.com&redirect_url=%2Fmember%2Frequests%2Freq_1",
    );

    render(<ClerkSignUpCard />);

    expect(consumeOauthNext()).toBe("/member/requests/req_1");
  });

  it("does not stash owner signup redirects", () => {
    searchParamsMock.value = new URLSearchParams("redirect_url=%2Fowner%2Frequests");

    render(<ClerkSignUpCard owner />);

    expect(consumeOauthNext()).toBeNull();
  });
});

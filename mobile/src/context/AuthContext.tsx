import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth as useClerkAuth, useSignIn, useSignUp } from "@clerk/expo";

import { API_BASE_URL } from "../constants";

type MeData = {
  email: string;
  role: string | null;
  app_role: string | null;
  platform_role: string | null;
  has_organization: boolean;
  default_route: string;
};

type AuthState = {
  token: string | null;
  me: MeData | null;
  loading: boolean;
};

type SignUpPayload = {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
};

type SignUpResult = { status: "complete" } | { status: "needs_verification" };

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: SignUpPayload) => Promise<SignUpResult>;
  verifyEmailCode: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Fetch a fresh Clerk JWT for API calls */
  getToken: () => Promise<string | null>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const {
    isLoaded: authLoaded,
    isSignedIn,
    getToken: clerkGetToken,
    signOut: clerkSignOut,
  } = useClerkAuth();
  const {
    signIn: clerkSignIn,
    setActive: setSignInActive,
    isLoaded: signInLoaded,
  } = useSignIn() as unknown as {
    signIn: { create: (payload: { identifier: string; password: string }) => Promise<any> } | null;
    setActive: (payload: { session: string | null }) => Promise<void>;
    isLoaded: boolean;
  };
  const {
    signUp: clerkSignUp,
    setActive: setSignUpActive,
    isLoaded: signUpLoaded,
  } = useSignUp() as unknown as {
    signUp:
      | {
          create: (payload: {
            emailAddress: string;
            password: string;
            firstName: string;
            lastName: string;
          }) => Promise<any>;
          prepareEmailAddressVerification: (payload: { strategy: "email_code" }) => Promise<void>;
          attemptEmailAddressVerification: (payload: { code: string }) => Promise<any>;
        }
      | null;
    setActive: (payload: { session: string | null }) => Promise<void>;
    isLoaded: boolean;
  };

  const [state, setState] = useState<AuthState>({ token: null, me: null, loading: true });

  const fetchMe = useCallback(async (token: string): Promise<MeData | null> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return {
        email: data.email,
        role: data.role,
        app_role: data.app_role,
        platform_role: data.platform_role,
        has_organization: data.has_organization ?? false,
        default_route: data.default_route ?? "/onboarding/personal",
      };
    } catch {
      return null;
    }
  }, []);

  // Sync auth state whenever Clerk session changes
  useEffect(() => {
    if (!authLoaded) return;
    if (!isSignedIn) {
      setState({ token: null, me: null, loading: false });
      return;
    }
    setState((prev) => ({ ...prev, loading: true }));
    clerkGetToken()
      .then(async (token) => {
        if (!token) {
          setState({ token: null, me: null, loading: false });
          return;
        }
        const me = await fetchMe(token);
        setState({ token, me, loading: false });
      })
      .catch(() => setState({ token: null, me: null, loading: false }));
  }, [authLoaded, isSignedIn, clerkGetToken, fetchMe]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      if (!signInLoaded || !clerkSignIn) throw new Error("Auth not ready");
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const result = await clerkSignIn.create({ identifier: email, password });
        if (result.status === "complete") {
          await setSignInActive({ session: result.createdSessionId });
          // State will sync via the useEffect above
        } else {
          throw new Error("Sign-in incomplete: " + result.status);
        }
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false }));
        throw err;
      }
    },
    [signInLoaded, clerkSignIn, setSignInActive]
  );

  const signUp = useCallback(
    async (payload: SignUpPayload): Promise<SignUpResult> => {
      if (!signUpLoaded || !clerkSignUp) throw new Error("Auth not ready");
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const result = await clerkSignUp.create({
          emailAddress: payload.email,
          password: payload.password,
          firstName: payload.first_name,
          lastName: payload.last_name,
        });
        if (result.status === "complete") {
          await setSignUpActive({ session: result.createdSessionId });
          return { status: "complete" };
        }
        await clerkSignUp.prepareEmailAddressVerification({ strategy: "email_code" });
        setState((prev) => ({ ...prev, loading: false }));
        return { status: "needs_verification" };
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false }));
        throw err;
      }
    },
    [signUpLoaded, clerkSignUp, setSignUpActive]
  );

  const verifyEmailCode = useCallback(
    async (code: string) => {
      if (!signUpLoaded || !clerkSignUp) throw new Error("Auth not ready");
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const result = await clerkSignUp.attemptEmailAddressVerification({ code });
        if (result.status !== "complete") {
          throw new Error("Email verification incomplete: " + result.status);
        }
        await setSignUpActive({ session: result.createdSessionId });
      } catch (err) {
        setState((prev) => ({ ...prev, loading: false }));
        throw err;
      }
    },
    [signUpLoaded, clerkSignUp, setSignUpActive]
  );

  const signOut = useCallback(async () => {
    await clerkSignOut();
    setState({ token: null, me: null, loading: false });
  }, [clerkSignOut]);

  const getToken = useCallback(() => clerkGetToken(), [clerkGetToken]);

  const value = useMemo<AuthContextValue>(
    () => ({ ...state, signIn, signUp, verifyEmailCode, signOut, getToken }),
    [state, signIn, signUp, verifyEmailCode, signOut, getToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

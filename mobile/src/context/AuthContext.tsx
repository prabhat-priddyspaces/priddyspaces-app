import { createContext, useCallback, useContext, useMemo, useState } from "react";

import { API_BASE_URL } from "../constants";
import { clearToken, setToken as persistToken } from "../lib/storage";

type MeResponse = {
  email: string;
  role: string | null;
};

type AuthState = {
  token: string | null;
  me: MeResponse | null;
  loading: boolean;
};

type AuthContextValue = AuthState & {
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    role: "owner" | "customer";
  }) => Promise<void>;
  signOut: () => Promise<void>;
  hydrate: (token: string) => Promise<void>;
  clear: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({ token: null, me: null, loading: false });

  const hydrate = useCallback(async (token: string) => {
    setState((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/me`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error("Unauthorized");
      }
      const data = await res.json();
      setState({ token, me: { email: data.email, role: data.role }, loading: false });
    } catch {
      await clearToken();
      setState({ token: null, me: null, loading: false });
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true }));
    const res = await fetch(`${API_BASE_URL}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setState((prev) => ({ ...prev, loading: false }));
      throw new Error(data.detail || "Login failed");
    }
    const data = await res.json();
    await persistToken(data.access_token);
    await hydrate(data.access_token);
  }, [hydrate]);

  const signUp = useCallback(
    async (payload: {
      email: string;
      password: string;
      first_name: string;
      last_name: string;
      role: "owner" | "customer";
    }) => {
      setState((prev) => ({ ...prev, loading: true }));
      const res = await fetch(`${API_BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          terms_accepted: true,
          privacy_policy_accepted: true
        })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setState((prev) => ({ ...prev, loading: false }));
        throw new Error(data.detail || "Registration failed");
      }
      const data = await res.json();
      await persistToken(data.access_token);
      await hydrate(data.access_token);
    },
    [hydrate]
  );

  const signOut = useCallback(async () => {
    await clearToken();
    setState({ token: null, me: null, loading: false });
  }, []);

  const clear = useCallback(async () => {
    await clearToken();
    setState({ token: null, me: null, loading: false });
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      signIn,
      signUp,
      signOut,
      hydrate,
      clear
    }),
    [state, signIn, signUp, signOut, hydrate, clear]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

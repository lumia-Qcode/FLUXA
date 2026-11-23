import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

export type Role = "admin" | "brand_manager" | "employee";

export interface Account {
  user: { id: number; email: string; name: string };
  org: { id: number; name: string };
  role: Role;
}

interface AuthState {
  account: Account | null;
  loading: boolean;
  refresh: () => Promise<Account | null>;
  setAccount: (a: Account | null) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      const next = res.ok ? ((await res.json()) as Account) : null;
      setAccount(next);
      return next;
    } catch {
      setAccount(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      setAccount(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ account, loading, refresh, setAccount, signOut }}>{children}</AuthContext.Provider>
  );
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}

/** Shows its children only to signed-in users; others go to /login and come back after. */
export const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { account, loading } = useAuth();
  const location = useLocation();
  if (loading) {
    return (
      <div
        role="status"
        aria-live="polite"
        style={{ minHeight: "100vh", background: "var(--bg-app)", color: "var(--ink-2)", display: "grid", placeItems: "center", fontSize: 14 }}
      >
        Loading…
      </div>
    );
  }
  if (!account) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return <>{children}</>;
};

/** Only same-site paths are allowed as a post-login destination (no open redirects). */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return "/workspace";
  return raw;
}

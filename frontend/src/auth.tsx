import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getAccessToken, setAccessToken } from "./api";
import type { User } from "./types";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  signIn(phone: string, code: string): Promise<void>;
  signOut(): void;
  refreshUser(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(Boolean(getAccessToken()));

  const refreshUser = async () => {
    if (!getAccessToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<User>("/auth/me"));
    } catch {
      setUser(null);
      setAccessToken(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refreshUser();
    const handleExpired = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener("auth-expired", handleExpired);
    return () => window.removeEventListener("auth-expired", handleExpired);
  }, []);

  const signIn = async (phone: string, code: string) => {
    const result = await api<{ access_token: string; user: User }>("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code }),
    });
    setAccessToken(result.access_token);
    setUser(result.user);
  };

  const signOut = () => {
    setAccessToken(null);
    setUser(null);
  };

  const value = useMemo(() => ({ user, loading, signIn, signOut, refreshUser }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}

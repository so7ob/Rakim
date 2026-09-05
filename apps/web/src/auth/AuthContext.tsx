import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet, apiRequest, setCsrfToken } from "../api";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
}
interface AuthValue {
  user: AuthUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: string[]) => boolean;
}
const AuthContext = createContext<AuthValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    apiGet<{ user: AuthUser | null; csrfToken: string }>(
      "/auth/status",
      controller.signal,
    )
      .then((result) => {
        if (!controller.signal.aborted) {
          setUser(result.user);
          setCsrfToken(result.csrfToken);
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) console.error(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      async login(username, password) {
        const result = await apiRequest<{ user: AuthUser; csrfToken: string }>(
          "/auth/login",
          { body: { username, password } },
        );
        setUser(result.user);
        setCsrfToken(result.csrfToken);
      },
      async logout() {
        await apiRequest<void>("/auth/logout");
        setUser(null);
        setCsrfToken("");
      },
      hasRole: (...roles) =>
        Boolean(user?.roles.some((role) => roles.includes(role))),
    }),
    [user, loading],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("AuthProvider is missing");
  return value;
}

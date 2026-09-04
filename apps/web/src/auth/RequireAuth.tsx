import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { LoadingCards } from "../components/StatePanel";

export function RequireAuth() {
  const auth = useAuth();
  const location = useLocation();
  if (auth.loading)
    return (
      <div className="container page-shell">
        <LoadingCards />
      </div>
    );
  if (!auth.user)
    return (
      <Navigate
        to="/ar/login"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  return <Outlet />;
}

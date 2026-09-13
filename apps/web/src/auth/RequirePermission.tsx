import { Navigate, Outlet, useLocation } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";

export function RequirePermission({
  anyOf,
  children,
}: {
  anyOf: string[];
  children?: ReactNode;
}) {
  const auth = useAuth();
  const location = useLocation();
  if (!auth.hasPermission(...anyOf))
    return (
      <Navigate
        replace
        to="/ar/admin/no-permission"
        state={{ deniedPath: location.pathname }}
      />
    );
  return children ?? <Outlet />;
}

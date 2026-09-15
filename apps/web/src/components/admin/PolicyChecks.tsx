import { Link } from "react-router-dom";
import { useAuth } from "../../auth/AuthContext";
export interface PolicyCheck {
  code: string;
  message: string;
  applies: boolean;
  allowed: boolean;
  result: string;
}
export function PolicyChecks({ checks }: { checks: PolicyCheck[] }) {
  const auth = useAuth();
  const relevant = checks.filter((check) => check.applies);
  if (!relevant.length) return null;
  return (
    <ul className="policy-checks">
      {relevant.map((check) => (
        <li key={check.code}>
          <span>
            {check.message} —{" "}
            {check.allowed
              ? check.result === "POLICY_DISABLED"
                ? "السياسة معطلة"
                : "مسموح باستثناء المستخدم"
              : "تمنعها السياسة"}
          </span>{" "}
          {auth.hasPermission("workflow_policy.view") && (
            <Link
              to={`/ar/admin/settings/workflow?policy=${encodeURIComponent(check.code)}`}
            >
              عرض السياسة
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

import { useApi } from "./use-api";
import type { PolicyCheck } from "../components/admin/PolicyChecks";
export function useOperationPolicies() {
  const state = useApi<PolicyCheck[]>("/admin/corrections/policies");
  return {
    ...state,
    allows: (code: string) =>
      state.data?.find((item) => item.code === code)?.allowed ?? false,
  };
}

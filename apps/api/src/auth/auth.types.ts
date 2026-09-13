import type { Request } from "express";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  permissionDetails?: Array<{
    code: string;
    allowed: boolean;
    scope: "ALL";
    sources: Array<{
      type: "ROLE" | "DIRECT_ALLOW";
      code: string;
      name?: string;
    }>;
    overrides: Array<{ type: "DIRECT_ALLOW" | "DIRECT_DENY" }>;
    policyChecks: Array<{ code: string; result: "PASSED" | "FAILED" }>;
  }>;
  policyCapabilities?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

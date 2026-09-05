import type { Request } from "express";

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  roles: string[];
  permissions: string[];
  permissionDetails?: Array<{
    code: string;
    scope: "ALL" | "OWN" | "ASSIGNED";
    source: "ROLE" | "DIRECT" | "POLICY_OVERRIDE";
    sourceCodes: string[];
  }>;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
  sessionId?: string;
}

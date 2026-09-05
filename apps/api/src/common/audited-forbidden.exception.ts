import { ForbiddenException } from "@nestjs/common";

export interface AuthorizationDenialAudit {
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  reason: string;
}

export class AuditedForbiddenException extends ForbiddenException {
  constructor(readonly audit: AuthorizationDenialAudit) {
    super(audit.reason);
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { Response } from "express";
import type { DataSource } from "typeorm";
import { DATABASE } from "../database/database.module.js";
import { AuditedForbiddenException } from "./audited-forbidden.exception.js";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  async catch(exception: unknown, host: ArgumentsHost): Promise<void> {
    const response = host.switchToHttp().getResponse<Response>();
    const sqlCode =
      (exception as { driverError?: { code?: string }; code?: string })
        ?.driverError?.code ?? (exception as { code?: string })?.code;
    const constraintMessage =
      sqlCode === "ER_DUP_ENTRY"
        ? "القيمة مكررة أو مستخدمة في سجل آخر؛ راجع الرمز والعلاقات."
        : ["ER_ROW_IS_REFERENCED_2", "ER_NO_REFERENCED_ROW_2"].includes(
              sqlCode ?? "",
            )
          ? "تعذر الحفظ بسبب ارتباط بسجل آخر؛ تحقق من العلاقات قبل إعادة المحاولة."
          : undefined;
    const status = constraintMessage
      ? HttpStatus.CONFLICT
      : exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) console.error(exception);
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      constraintMessage ??
      (typeof raw === "object" && raw !== null && "message" in raw
        ? (raw as { message: string | string[] }).message
        : status === 500
          ? "حدث خطأ داخلي غير متوقع."
          : String(raw ?? "تعذر تنفيذ الطلب."));
    if (exception instanceof AuditedForbiddenException) {
      try {
        const audit = exception.audit;
        await this.db.query(
          `INSERT INTO audit_logs
           (id,actor_id,action,entity_type,entity_id,before_json,after_json,reason)
           VALUES (?,?,?,?,?,NULL,?,?)`,
          [
            randomUUID(),
            audit.actorId,
            audit.action,
            audit.entityType,
            audit.entityId.slice(0, 36),
            JSON.stringify({ result: "DENIED" }),
            audit.reason,
          ],
        );
      } catch (auditError) {
        console.error("تعذر تسجيل محاولة تجاوز سلطة مرفوضة.", auditError);
      }
    }
    response.status(status).json({
      statusCode: status,
      message,
      error: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
}

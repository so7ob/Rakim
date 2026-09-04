import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;
    if (status === HttpStatus.INTERNAL_SERVER_ERROR) console.error(exception);
    const raw =
      exception instanceof HttpException ? exception.getResponse() : null;
    const message =
      typeof raw === "object" && raw !== null && "message" in raw
        ? (raw as { message: string | string[] }).message
        : status === 500
          ? "حدث خطأ داخلي غير متوقع."
          : String(raw ?? "تعذر تنفيذ الطلب.");
    response.status(status).json({
      statusCode: status,
      message,
      error: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
      timestamp: new Date().toISOString(),
    });
  }
}

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsString, Length, Matches } from "class-validator";
import type { Request, Response } from "express";
import type { AuthenticatedRequest } from "./auth.types.js";
import { AuthService } from "./auth.service.js";
import { SessionGuard } from "./session.guard.js";

class LoginDto {
  @IsString() @Length(2, 120) username!: string;
  @IsString() @Length(8, 200) password!: string;
}
class ChangePasswordDto {
  @IsString() currentPassword!: string;
  @IsString()
  @Length(12, 200)
  @Matches(/[A-Za-z]/)
  @Matches(/\d/)
  newPassword!: string;
}

@ApiTags("المصادقة")
@Controller("auth")
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(200)
  @ApiOperation({ summary: "تسجيل الدخول وإنشاء جلسة إدارية آمنة" })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = await this.auth.login(dto.username, dto.password, {
      ip: request.ip,
      userAgent: request.header("user-agent"),
    });
    response.cookie("ylp_session", result.token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: Number(process.env.SESSION_HOURS ?? 8) * 60 * 60 * 1000,
    });
    return { user: result.user, csrfToken: result.csrfToken };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "الحساب والجلسة الحالية" })
  async me(@Req() request: AuthenticatedRequest) {
    return {
      user: request.user,
      csrfToken: await this.auth.rotateCsrf(request.sessionId!),
    };
  }

  @Post("logout")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "إنهاء الجلسة الحالية" })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(request.sessionId!, request.user!.id);
    response.clearCookie("ylp_session", {
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    });
  }

  @Post("change-password")
  @HttpCode(204)
  @UseGuards(SessionGuard)
  @ApiOperation({ summary: "تغيير كلمة المرور وإبطال الجلسات" })
  changePassword(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.auth.changePassword(
      request.user!.id,
      dto.currentPassword,
      dto.newPassword,
    );
  }
}

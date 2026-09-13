import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Patch,
  Req,
  UseGuards,
} from "@nestjs/common";
import { IsBoolean, IsIn, IsObject, IsString, Length } from "class-validator";
import type { AuthenticatedRequest } from "../auth/auth.types.js";
import { SessionGuard } from "../auth/session.guard.js";
import { UserToolsService } from "./user-tools.service.js";
class PersonalStateDto {
  @IsBoolean() active!: boolean;
}
class NoteUpdateDto {
  @IsString() @Length(2, 5000) text!: string;
}
class SaveSearchDto {
  @IsString() @Length(2, 200) name!: string;
  @IsObject() query!: Record<string, unknown>;
}
class NoteDto {
  @IsIn(["LEGISLATION", "ARTICLE", "ANNEX"]) entityType!: string;
  @IsString() entityId!: string;
  @IsString() @Length(2, 5000) text!: string;
}
class ReportDto {
  @IsIn(["LEGISLATION", "ARTICLE", "ANNEX"]) entityType!: string;
  @IsString() entityId!: string;
  @IsIn(["TYPO", "MISSING_SOURCE", "WRONG_DATE", "BROKEN_LINK", "OTHER"])
  category!: string;
  @IsString() @Length(5, 5000) details!: string;
}
@Controller("me")
@UseGuards(SessionGuard)
export class UserToolsController {
  constructor(
    @Inject(UserToolsService) private readonly service: UserToolsService,
  ) {}
  @Patch(":kind/:id/state") state(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() dto: PersonalStateDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.setActive(r.user!.id, kind, id, dto.active);
  }
  @Patch("saved-searches/:id") updateSearch(
    @Param("id") id: string,
    @Body() dto: SaveSearchDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.updateSearch(r.user!.id, id, dto.name, dto.query);
  }
  @Patch("notes/:id") updateNote(
    @Param("id") id: string,
    @Body() dto: NoteUpdateDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.updateNote(r.user!.id, id, dto.text);
  }
  @Get("favorites") favorites(@Req() r: AuthenticatedRequest) {
    return this.service.favorites(r.user!.id);
  }
  @Post("favorites/:id") favorite(
    @Param("id") id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.favorite(r.user!.id, id);
  }
  @Delete("favorites/:id") unfavorite(
    @Param("id") id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.unfavorite(r.user!.id, id);
  }
  @Get("saved-searches") searches(@Req() r: AuthenticatedRequest) {
    return this.service.savedSearches(r.user!.id);
  }
  @Post("saved-searches") save(
    @Body() dto: SaveSearchDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.saveSearch(r.user!.id, dto.name, dto.query);
  }
  @Delete("saved-searches/:id") deleteSearch(
    @Param("id") id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.deleteSavedSearch(r.user!.id, id);
  }
  @Get("notes") notes(@Req() r: AuthenticatedRequest) {
    return this.service.notes(r.user!.id);
  }
  @Post("notes") note(@Body() dto: NoteDto, @Req() r: AuthenticatedRequest) {
    return this.service.addNote(
      r.user!.id,
      dto.entityType,
      dto.entityId,
      dto.text,
    );
  }
  @Delete("notes/:id") deleteNote(
    @Param("id") id: string,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.deleteNote(r.user!.id, id);
  }
  @Post("reports") report(
    @Body() dto: ReportDto,
    @Req() r: AuthenticatedRequest,
  ) {
    return this.service.report(dto, r.user);
  }
}

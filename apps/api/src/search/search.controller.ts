import {
  BadRequestException,
  Controller,
  Get,
  Inject,
  Query,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { SEARCH_PROVIDER, type SearchProvider } from "./search.provider.js";

@ApiTags("البحث")
@Controller("search")
export class SearchController {
  constructor(
    @Inject(SEARCH_PROVIDER) private readonly provider: SearchProvider,
  ) {}

  @Get("analytics")
  @ApiOperation({
    summary: "تحليلات نتائج البحث والتوزيع الزمني والعبارات المصاحبة",
  })
  analytics(@Query() query: Record<string, string | undefined>) {
    return this.provider.analytics(this.input(query, 500));
  }

  @Get("export.csv")
  @ApiOperation({ summary: "تصدير نتائج البحث المنشورة إلى CSV" })
  async export(
    @Query() query: Record<string, string | undefined>,
    @Res() response: Response,
  ) {
    const csv = await this.provider.exportCsv(this.input(query, 5000));
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="legislation-search-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    response.send(csv);
  }

  @Get()
  @ApiOperation({
    summary: "بحث عربي متقدم على مستوى التشريع والمادة والنسخة والملحق",
  })
  search(@Query() query: Record<string, string | undefined>) {
    return this.provider.search(this.input(query, 50));
  }

  private input(query: Record<string, string | undefined>, maximum: number) {
    const q = query.q;
    if (!q?.trim())
      throw new BadRequestException("أدخل عبارة بحث واحدة على الأقل.");
    const page = Math.max(1, Number(query.page ?? 1) || 1);
    const pageSize = Math.min(
      maximum,
      Math.max(1, Number(query.pageSize ?? 10) || 10),
    );
    if (query.at && !/^\d{4}-\d{2}-\d{2}$/.test(query.at))
      throw new BadRequestException("صيغة التاريخ المطلوبة YYYY-MM-DD.");
    const mode = ["all", "any", "exact"].includes(query.mode ?? "")
      ? (query.mode as "all" | "any" | "exact")
      : "all";
    return {
      q: q.trim(),
      page,
      pageSize,
      at: query.at,
      historical: query.historical === "true",
      mode,
      field: ["all", "title", "number"].includes(query.field ?? "")
        ? (query.field as "all" | "title" | "number")
        : "all",
      type: query.type,
      authority: query.authority,
      subject: query.subject,
      status: query.status,
      yearFrom: Number(query.yearFrom) || undefined,
      yearTo: Number(query.yearTo) || undefined,
      verification: query.verification,
      entityType: query.entityType,
      proximityFirst: query.proximityFirst,
      proximitySecond: query.proximitySecond,
      proximityDistance: Number(query.proximityDistance) || undefined,
    };
  }
}

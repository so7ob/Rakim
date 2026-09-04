import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { DataSource } from "typeorm";
import { statfs } from "node:fs/promises";
import { resolve } from "node:path";
import { DATABASE } from "./database/database.module.js";

@ApiTags("الصحة")
@Controller("health")
export class HealthController {
  constructor(@Inject(DATABASE) private readonly db: DataSource) {}

  @Get()
  @ApiOperation({ summary: "فحص صحة API واتصال قاعدة البيانات" })
  async health() {
    await this.db.query("SELECT 1");
    const [workers,jobs,storage]=await Promise.all([
      this.db.query("SELECT COUNT(*) active FROM service_heartbeats WHERE service_type='WORKER' AND last_seen_at>DATE_SUB(NOW(3),INTERVAL 15 SECOND)"),
      this.db.query("SELECT SUM(status='FAILED') failed,SUM(status='READY') queued,SUM(status='RUNNING') running FROM job_queue"),
      statfs(resolve(process.env.DATA_ROOT??resolve(process.cwd(),'../../data'))).catch(()=>null),
    ]);
    const worker=Number(workers[0]?.active??0)>0?'ok':'stale';
    return {
      status: worker==='ok'?"ok":"degraded",
      database: "ok",
      worker,
      jobs:{failed:Number(jobs[0]?.failed??0),queued:Number(jobs[0]?.queued??0),running:Number(jobs[0]?.running??0)},
      storage:storage?{freeBytes:storage.bavail*storage.bsize,totalBytes:storage.blocks*storage.bsize}:"unknown",
      service: "yemen-legislation-api",
      timestamp: new Date().toISOString(),
    };
  }
}

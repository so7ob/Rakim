import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import { resolve } from 'node:path';
import { config } from 'dotenv';
import { DataSource, type EntityManager } from 'typeorm';

config({ path: [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')] });
const workerId = `${hostname()}-${process.pid}-${randomUUID().slice(0, 8)}`;
const db = new DataSource({
  type: 'mariadb', host: process.env.DATABASE_HOST ?? '127.0.0.1', port: Number(process.env.DATABASE_PORT ?? 3306),
  username: process.env.DATABASE_USER ?? 'legislation_app', password: process.env.DATABASE_PASSWORD ?? '',
  database: process.env.DATABASE_NAME ?? 'yemen_legislation', charset: 'utf8mb4', timezone: 'Z',
});

async function claim(manager: EntityManager): Promise<{id:string; job_type:string; payload_json:string} | null> {
  const rows = await manager.query(`SELECT id,job_type,payload_json FROM job_queue
    WHERE status='READY' AND available_at<=NOW(3) ORDER BY priority,created_at LIMIT 1 FOR UPDATE SKIP LOCKED`);
  if (!rows[0]) return null;
  await manager.query(`UPDATE job_queue SET status='RUNNING',locked_by=?,locked_at=NOW(3),attempts=attempts+1 WHERE id=?`, [workerId, rows[0].id]);
  return rows[0];
}

async function tick(): Promise<void> {
  const job = await db.transaction((manager) => claim(manager));
  if (!job) return;
  try {
    if (!['IMPORT_SOURCE','OCR_SOURCE','REINDEX_ENTITY'].includes(job.job_type)) throw new Error(`نوع مهمة غير مدعوم: ${job.job_type}`);
    // معالجات الاستخراج الفعلية تضاف في المرحلة 3؛ لا ينشر العامل OCR غير مراجع.
    await db.query(`UPDATE job_queue SET status='FAILED',last_error=? WHERE id=?`, ['المعالج غير مفعل في هذه المرحلة؛ بقيت بيانات المصدر آمنة ولم تنشر.', job.id]);
  } catch (error) {
    await db.query(`UPDATE job_queue SET status='FAILED',last_error=? WHERE id=?`, [String(error), job.id]);
  }
}

async function main() {
  await db.initialize();
  console.log(JSON.stringify({ event: 'worker.started', workerId }));
  const timer = setInterval(() => void tick(), 3000);
  const stop = async () => { clearInterval(timer); await db.destroy(); process.exit(0); };
  process.on('SIGTERM', () => void stop()); process.on('SIGINT', () => void stop());
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });

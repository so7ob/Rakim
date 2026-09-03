import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DataSource } from 'typeorm';
import { TemporalConflictError, TemporalVersionService } from '../articles/temporal-version.service.js';
import { LegislationsService } from '../legislations/legislations.service.js';
import { createDataSource } from './config.js';

describe('MariaDB temporal integrity', () => {
  let db: DataSource; let lawId: string; let articleId: string; let sourceId: string; let auditedLawId: string | null = null;
  beforeAll(async () => {
    db = await createDataSource().initialize();
    const refs = await db.query('SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId,(SELECT id FROM source_documents WHERE extraction_status="REVIEWED" LIMIT 1) sourceId');
    sourceId = refs[0].sourceId; lawId = randomUUID(); articleId = randomUUID();
    await db.query(`INSERT INTO legislations (id,type_id,authority_id,year,title_ar,status,legal_status,verification_level)
      VALUES (?,?,?,2026,'تشريع مؤقت لاختبار التزامن','DRAFT','UNKNOWN','D')`, [lawId, refs[0].typeId, refs[0].authorityId]);
    await db.query(`INSERT INTO articles (id,legislation_id,published_label,current_label,sort_key) VALUES (?,?,'1','1','00001')`, [articleId, lawId]);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query('DELETE FROM article_versions WHERE article_id=?', [articleId]);
      await db.query('DELETE FROM articles WHERE id=?', [articleId]);
      await db.query('DELETE FROM legislations WHERE id=?', [lawId]);
      if(auditedLawId){const runner=db.createQueryRunner();await runner.connect();try{await runner.query('SET @ylp_maintenance=1');await runner.query("DELETE FROM audit_logs WHERE entity_type='LEGISLATION' AND entity_id=?",[auditedLawId]);await runner.query('DELETE FROM legislations WHERE id=?',[auditedLawId]);}finally{await runner.release();}}
      await db.destroy();
    }
  });

  it('serializes concurrent writes and accepts only one overlapping interval', async () => {
    const service = new TemporalVersionService(db);
    const input = { articleId, textOriginal:'نسخة اختبار التزامن', validFrom:'2026-01-01', validTo:'2027-01-01', sourceDocumentId:sourceId };
    const results = await Promise.allSettled([service.create(input), service.create({...input,textOriginal:'نسخة متعارضة'})]);
    expect(results.filter((item)=>item.status==='fulfilled')).toHaveLength(1);
    const rejected = results.find((item)=>item.status==='rejected') as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(TemporalConflictError);
  });

  it('rejects changing the legal text of a published version', async () => {
    const versionId = (await db.query("SELECT id FROM article_versions WHERE status='PUBLISHED' LIMIT 1"))[0].id;
    await expect(db.query("UPDATE article_versions SET text_original='تغيير صامت' WHERE id=?",[versionId]))
      .rejects.toThrow(/PUBLISHED_ARTICLE_VERSION_IMMUTABLE/);
  });

  it('rejects deleting a published historical version', async () => {
    const versionId = (await db.query("SELECT id FROM article_versions WHERE status='PUBLISHED' LIMIT 1"))[0].id;
    await expect(db.query('DELETE FROM article_versions WHERE id=?',[versionId]))
      .rejects.toThrow(/PUBLISHED_ARTICLE_VERSION_DELETE_FORBIDDEN/);
  });

  it('creates an authorized draft with an immutable audit event', async()=>{
    const refs=await db.query('SELECT (SELECT id FROM legislation_types LIMIT 1) typeId,(SELECT id FROM authorities LIMIT 1) authorityId');
    const created=await new LegislationsService(db).create({titleAr:'مسودة تكامل مدققة',typeId:refs[0].typeId,authorityId:refs[0].authorityId,year:2026},'DATA_ENTRY','data_entry');
    auditedLawId=created.id;
    const logs=await db.query("SELECT action,reason FROM audit_logs WHERE entity_type='LEGISLATION' AND entity_id=?",[created.id]);
    expect(logs).toMatchObject([{action:'CREATE_DRAFT',reason:'إنشاء مسودة عبر API'}]);
  });
});

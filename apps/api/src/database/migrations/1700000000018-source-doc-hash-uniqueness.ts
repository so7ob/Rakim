import type { MigrationInterface, QueryRunner } from "typeorm";

export class SourceDocHashUniqueness1700000000018
  implements MigrationInterface
{
  name = "SourceDocHashUniqueness1700000000018";

  async up(q: QueryRunner): Promise<void> {
    await q.query("DROP INDEX sha256 ON source_documents");
    await q.query(
      "ALTER TABLE source_documents ADD UNIQUE KEY uq_source_sha256_active (sha256, is_active)",
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query("DROP INDEX uq_source_sha256_active ON source_documents");
    await q.query("ALTER TABLE source_documents ADD UNIQUE KEY sha256 (sha256)");
  }
}

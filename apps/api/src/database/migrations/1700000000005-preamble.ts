import type { MigrationInterface, QueryRunner } from "typeorm";

export class Preamble1700000000005 implements MigrationInterface {
  name = "Preamble1700000000005";

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE legislation_versions ADD COLUMN preamble_text LONGTEXT NULL AFTER content_kind",
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE legislation_versions DROP COLUMN preamble_text",
    );
  }
}

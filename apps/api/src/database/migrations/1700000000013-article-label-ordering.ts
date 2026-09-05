import type { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Article labels are legal locators, not document ordering keys. Historical
 * instruments can repeat a locator or add a suffixed locator; sort_key remains
 * the stable order source.
 */
export class ArticleLabelOrdering1700000000013 implements MigrationInterface {
  name = "ArticleLabelOrdering1700000000013";

  async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE articles
       DROP INDEX uq_article_label,
       ADD KEY idx_article_label (legislation_id,current_label)`,
    );
  }

  async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE articles
       DROP INDEX idx_article_label,
       ADD UNIQUE KEY uq_article_label (legislation_id,current_label)`,
    );
  }
}

import type { MigrationInterface, QueryRunner } from "typeorm";

const themeDefaults = [
  ["theme.navy", "#314B67", "#344B61"],
  ["theme.burgundy", "#AD405B", "#AC4459"],
  ["theme.hero_start", "#AD405B", "#AC4459"],
  ["theme.hero_end", "#314B67", "#344B61"],
] as const;

export class ReferenceThemeDefaults1700000000011 implements MigrationInterface {
  name = "ReferenceThemeDefaults1700000000011";

  async up(q: QueryRunner): Promise<void> {
    for (const [key, previous, current] of themeDefaults)
      await q.query(
        `UPDATE platform_settings SET value_json=JSON_QUOTE(?)
         WHERE setting_key=? AND JSON_UNQUOTE(value_json)=?`,
        [current, key, previous],
      );
  }

  async down(q: QueryRunner): Promise<void> {
    for (const [key, previous, current] of themeDefaults)
      await q.query(
        `UPDATE platform_settings SET value_json=JSON_QUOTE(?)
         WHERE setting_key=? AND JSON_UNQUOTE(value_json)=?`,
        [previous, key, current],
      );
  }
}

# ERD — المرحلة الأساسية

```mermaid
erDiagram
  LEGISLATION_TYPE ||--o{ LEGISLATION : classifies
  AUTHORITY ||--o{ LEGISLATION : issues
  GAZETTE_ISSUE ||--o{ LEGISLATION : publishes
  LEGISLATION ||--o{ LEGISLATION_VERSION : versions
  LEGISLATION ||--o{ STRUCTURE_NODE : structures
  STRUCTURE_NODE ||--o{ STRUCTURE_NODE : contains
  LEGISLATION ||--o{ ARTICLE : contains
  STRUCTURE_NODE ||--o{ ARTICLE : groups
  ARTICLE ||--o{ ARTICLE_VERSION : versions
  SOURCE_DOCUMENT ||--o{ ARTICLE_VERSION : proves
  AMENDMENT ||--o{ AMENDMENT_OPERATION : contains
  AMENDMENT_OPERATION ||--o{ ARTICLE_MODIFICATION : affects
  ARTICLE ||--o{ ARTICLE_MODIFICATION : target
  ARTICLE_VERSION ||--o{ PREVIOUS_TEXT_SNAPSHOT : snapshots
  LEGISLATION ||--o{ ANNEX : has
  ANNEX ||--o{ ANNEX_VERSION : versions
  ANNEX_VERSION ||--o{ ANNEX_FILE : files
  ANNEX_FILE ||--|| VIEWER_METADATA : configures
  LEGISLATION ||--o{ LEGAL_RELATION : source
  LEGISLATION ||--o{ LEGAL_RELATION : target
  USER ||--o{ AUDIT_LOG : acts
  USER }o--o{ ROLE : receives
```

المعرّفات UUID (`CHAR(36)`)، وكل التواريخ القانونية `DATE`. قواعد الفترات الزمنية ومناعة النسخ المنشورة تطبقها الترحيلات داخل MariaDB إضافة إلى معاملة الخدمة.


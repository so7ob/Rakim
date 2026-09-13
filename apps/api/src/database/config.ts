import { RecoveryEditRevisions1700000000017 } from "./migrations/1700000000017-recovery-edit-revisions.js";
import { ReferenceLifecycle1700000000016 } from "./migrations/1700000000016-reference-lifecycle.js";
import "reflect-metadata";
import { config } from "dotenv";
import { resolve } from "node:path";
import { DataSource } from "typeorm";
import { InitialSchema1700000000000 } from "./migrations/1700000000000-initial-schema.js";
import { ImmutabilityHardening1700000000001 } from "./migrations/1700000000001-immutability-hardening.js";
import { AdminWorkflow1700000000002 } from "./migrations/1700000000002-admin-workflow.js";
import { AmendmentWorkflow1700000000003 } from "./migrations/1700000000003-amendment-workflow.js";
import { Observability1700000000004 } from "./migrations/1700000000004-observability.js";
import { Preamble1700000000005 } from "./migrations/1700000000005-preamble.js";
import { PlatformSettings1700000000006 } from "./migrations/1700000000006-platform-settings.js";
import { VisualSettings1700000000007 } from "./migrations/1700000000007-visual-settings.js";
import { WorkflowControls1700000000008 } from "./migrations/1700000000008-workflow-controls.js";
import { WorkflowPolicyCatalog1700000000009 } from "./migrations/1700000000009-workflow-policy-catalog.js";
import { GranularAccessControl1700000000010 } from "./migrations/1700000000010-granular-access-control.js";
import { ReferenceThemeDefaults1700000000011 } from "./migrations/1700000000011-reference-theme-defaults.js";
import { CanonicalRbacSecurity1700000000012 } from "./migrations/1700000000012-canonical-rbac-security.js";
import { ArticleLabelOrdering1700000000013 } from "./migrations/1700000000013-article-label-ordering.js";
import { MultiSourceImports1700000000014 } from "./migrations/1700000000014-multi-source-imports.js";
import { SourceDocHashUniqueness1700000000018 } from "./migrations/1700000000018-source-doc-hash-uniqueness.js";

import { AdministrativeLifecycle1700000000015 } from "./migrations/1700000000015-administrative-lifecycle.js";

config({
  path: [resolve(process.cwd(), ".env"), resolve(process.cwd(), "../../.env")],
});

export const createDataSource = () =>
  new DataSource({
    type: "mariadb",
    host: process.env.DATABASE_HOST ?? "127.0.0.1",
    port: Number(process.env.DATABASE_PORT ?? 3306),
    username: process.env.DATABASE_USER ?? "legislation_app",
    password: process.env.DATABASE_PASSWORD ?? "",
    database: process.env.DATABASE_NAME ?? "yemen_legislation",
    charset: "utf8mb4",
    timezone: "Z",
    logging: process.env.DATABASE_LOGGING === "true",
    extra: {
      connectionLimit: Number(process.env.DATABASE_POOL_SIZE ?? 5),
      idleTimeout: Number(process.env.DATABASE_IDLE_TIMEOUT_MS ?? 60_000),
      enableKeepAlive: true,
    },
    migrations: [
      InitialSchema1700000000000,
      ImmutabilityHardening1700000000001,
      AdminWorkflow1700000000002,
      AmendmentWorkflow1700000000003,
      Observability1700000000004,
      Preamble1700000000005,
      PlatformSettings1700000000006,
      VisualSettings1700000000007,
      WorkflowControls1700000000008,
      WorkflowPolicyCatalog1700000000009,
      GranularAccessControl1700000000010,
      ReferenceThemeDefaults1700000000011,
      CanonicalRbacSecurity1700000000012,
      ArticleLabelOrdering1700000000013,
      MultiSourceImports1700000000014,
      AdministrativeLifecycle1700000000015,
      ReferenceLifecycle1700000000016,
      RecoveryEditRevisions1700000000017,
      SourceDocHashUniqueness1700000000018,
    ],
    migrationsTableName: "schema_migrations",
  });

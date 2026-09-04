import { createDataSource } from "./config.js";

async function main() {
  const command = process.argv[2];
  const db = await createDataSource().initialize();
  try {
    if (command === "migrate") {
      const applied = await db.runMigrations({ transaction: "each" });
      console.log(
        JSON.stringify({
          event: "migration.complete",
          applied: applied.map((item) => item.name),
        }),
      );
    } else if (command === "revert") {
      await db.undoLastMigration({ transaction: "each" });
      console.log(JSON.stringify({ event: "migration.reverted" }));
    } else {
      throw new Error("الاستخدام: npm run db:migrate أو npm run db:revert");
    }
  } finally {
    await db.destroy();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

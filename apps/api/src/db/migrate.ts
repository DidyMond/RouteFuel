import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FileMigrationProvider, Migrator } from "kysely";
import { db } from "./index";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({
    db,
    provider: new FileMigrationProvider({
      fs,
      path,
      migrationFolder: path.join(__dirname, "migrations"),
    }),
  });

  const { error, results } = await migrator.migrateToLatest();

  for (const result of results ?? []) {
    if (result.status === "Success") {
      console.log(`Migrazione "${result.migrationName}" eseguita con successo`);
    } else if (result.status === "Error") {
      console.error(`Migrazione "${result.migrationName}" fallita`);
    }
  }

  if (error) {
    console.error("Migrazione interrotta:", error);
    await db.destroy();
    process.exit(1);
  }

  await db.destroy();
}

migrateToLatest();

import { type Migration, type MigrationProvider, Migrator } from "kysely";
import { db } from "./index";
import * as m0001Init from "./migrations/0001_init";

/**
 * Provider con import statici invece di FileMigrationProvider: quest'ultimo
 * fa import() dinamico di percorsi assoluti, che su Windows falliscono
 * (ERR_UNSUPPORTED_ESM_URL_SCHEME). Ogni nuova migrazione va aggiunta qui,
 * con un nome che ne determina l'ordine di esecuzione.
 */
const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return {
      "0001_init": m0001Init,
    };
  },
};

async function migrateToLatest(): Promise<void> {
  const migrator = new Migrator({ db, provider: migrationProvider });

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

  console.log("Database aggiornato all'ultima migrazione.");
  await db.destroy();
}

migrateToLatest();

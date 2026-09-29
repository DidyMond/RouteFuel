import { type Kysely, sql } from "kysely";

/**
 * Riquadri geografici già aggiornati con i prezzi in tempo reale: evita di
 * richiamare la fonte ufficiale per la stessa zona a ogni ricerca (cache
 * condivisa tra utenti e sopravvive ai riavvii).
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("live_price_tiles")
    .addColumn("tile_id", "text", (col) => col.primaryKey())
    .addColumn("refreshed_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("stations_seen", "integer", (col) => col.notNull().defaultTo(0))
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("live_price_tiles").execute();
}

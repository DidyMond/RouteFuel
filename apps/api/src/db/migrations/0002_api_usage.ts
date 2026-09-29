import { type Kysely, sql } from "kysely";

/**
 * Contatore mensile delle chiamate a servizi esterni a pagamento (Mapbox
 * Directions): alimenta il kill switch che disabilita il routing reale
 * quando ci si avvicina ai limiti del free tier.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable("api_usage")
    .addColumn("service", "text", (col) => col.notNull())
    .addColumn("period", "text", (col) => col.notNull()) // 'YYYY-MM' (UTC)
    .addColumn("count", "bigint", (col) => col.notNull().defaultTo(0))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("api_usage_pk", ["service", "period"])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("api_usage").execute();
}

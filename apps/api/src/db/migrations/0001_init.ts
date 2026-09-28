import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS postgis`.execute(db);

  await db.schema
    .createTable("stations")
    .addColumn("id", "integer", (col) => col.primaryKey())
    .addColumn("gestore", "text", (col) => col.notNull())
    .addColumn("bandiera", "text", (col) => col.notNull())
    .addColumn("tipo_impianto", "text", (col) => col.notNull())
    .addColumn("nome_impianto", "text", (col) => col.notNull())
    .addColumn("indirizzo", "text", (col) => col.notNull())
    .addColumn("comune", "text", (col) => col.notNull())
    .addColumn("provincia", "text", (col) => col.notNull())
    .addColumn("lat", "double precision", (col) => col.notNull())
    .addColumn("lon", "double precision", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    ALTER TABLE stations
    ADD CONSTRAINT tipo_impianto_check CHECK (tipo_impianto IN ('stradale', 'autostradale'))
  `.execute(db);

  // Colonna geospaziale generata: PostGIS non è un tipo Kysely nativo, va
  // aggiunta via SQL raw. STORED + GENERATED ALWAYS la ricalcola in automatico
  // ad ogni upsert di lat/lon, senza logica applicativa dedicata.
  await sql`
    ALTER TABLE stations
    ADD COLUMN geom geography(Point, 4326)
    GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::geography) STORED
  `.execute(db);

  await sql`CREATE INDEX stations_geom_idx ON stations USING GIST (geom)`.execute(db);

  await db.schema
    .createTable("fuel_prices")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("station_id", "integer", (col) => col.notNull().references("stations.id").onDelete("cascade"))
    .addColumn("fuel_type", "text", (col) => col.notNull())
    .addColumn("raw_desc_carburante", "text", (col) => col.notNull())
    .addColumn("is_self", "boolean", (col) => col.notNull())
    .addColumn("price", "double precision", (col) => col.notNull())
    .addColumn("communicated_at", "timestamptz", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();

  await sql`
    ALTER TABLE fuel_prices
    ADD CONSTRAINT fuel_type_check
    CHECK (fuel_type IN ('benzina','diesel','gpl','metano','hvo','other','unknown'))
  `.execute(db);

  // Una sola riga per stazione+carburante+modalità: l'app-layer (dedupeToLowestPricePerStationFuelMode
  // in packages/core) garantisce già l'unicità entro un singolo batch di ingestione;
  // questo indice la rende anche un vincolo di integrità a livello DB.
  await sql`
    CREATE UNIQUE INDEX fuel_prices_station_fuel_mode_idx
    ON fuel_prices (station_id, fuel_type, is_self)
  `.execute(db);

  await db.schema
    .createTable("ingestion_runs")
    .addColumn("id", "serial", (col) => col.primaryKey())
    .addColumn("started_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .addColumn("stations_upserted", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("prices_upserted", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("warnings_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("running"))
    .addColumn("error_message", "text")
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable("ingestion_runs").execute();
  await db.schema.dropTable("fuel_prices").execute();
  await db.schema.dropTable("stations").execute();
}

import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

// Resolve the migrations folder relative to THIS module, not the CWD, so it works
// whether launched via tsx from packages/db or as compiled JS from the repo root (Docker).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../drizzle', import.meta.url));

export async function runMigrations(url: string): Promise<void> {
  const sql = postgres(url, { max: 1 });
  try {
    await sql`SELECT pg_advisory_lock(727274)`; // single migrator across replicas
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await sql`SELECT pg_advisory_unlock(727274)`;
    await sql.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  runMigrations(url)
    .then(() => process.exit(0))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

// postgres-js connects lazily (no socket until the first query), so importing
// this module is side-effect-free even when DATABASE_URL is unset.
const connectionString = process.env.DATABASE_URL ?? 'postgres://localhost:5432/postgres';
const queryClient = postgres(connectionString, { max: 10, prepare: false });

export const db = drizzle(queryClient, { schema });
export type DB = typeof db;

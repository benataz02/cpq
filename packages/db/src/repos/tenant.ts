import { eq } from 'drizzle-orm';
import { db } from '../client.js';
import { tenants } from '../schema.js';

// In-process slug -> uuid cache so repeated resolves are stable and cheap across calls.
const cache = new Map<string, string>();

export async function getOrCreateTenantId(slug: string): Promise<string> {
  const cached = cache.get(slug);
  if (cached) return cached;

  const [existing] = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.name, slug))
    .limit(1);
  if (existing) {
    cache.set(slug, existing.id);
    return existing.id;
  }

  const [created] = await db.insert(tenants).values({ name: slug }).returning({ id: tenants.id });
  cache.set(slug, created!.id);
  return created!.id;
}

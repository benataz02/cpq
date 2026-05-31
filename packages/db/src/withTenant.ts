import { getContext } from '@cpq/core/server';
import { db } from './client.js';

export async function withTenant<T>(fn: (database: typeof db) => Promise<T>): Promise<T> {
  const { tenantId } = getContext(); // makes tenant scoping explicit; throws if unbound
  void tenantId; // P0: pass-through. SaaS: db.transaction(tx => SET LOCAL app.tenant_id = ${tenantId}; fn(tx))
  return fn(db);
}

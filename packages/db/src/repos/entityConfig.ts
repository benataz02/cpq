import { and, eq } from 'drizzle-orm';
import { db } from '../client.js';
import { sapEntityConfigs } from '../schema.js';

export type EntityOp = 'read' | 'create' | 'update' | 'delete' | 'action';

// Thrown when a SAP op is attempted on an entity set the tenant has not allowlisted.
export class EntityNotAllowedError extends Error {
  constructor(entitySet: string, op: EntityOp) {
    super(`operation '${op}' is not allowed on entity set '${entitySet}'`);
    this.name = 'EntityNotAllowedError';
  }
}

export async function listEntityConfigs(tenantId: string) {
  return db.select().from(sapEntityConfigs).where(eq(sapEntityConfigs.tenantId, tenantId));
}

export async function upsertEntityConfig(
  tenantId: string,
  entitySet: string,
  enabledOps: EntityOp[],
  labelField?: string,
) {
  await db
    .insert(sapEntityConfigs)
    .values({ tenantId, entitySet, enabledOps, labelField })
    .onConflictDoUpdate({
      target: [sapEntityConfigs.tenantId, sapEntityConfigs.entitySet],
      set: { enabledOps, labelField, updatedAt: new Date() },
    });
}

export async function assertOpAllowed(
  tenantId: string,
  entitySet: string,
  op: EntityOp,
): Promise<void> {
  const [row] = await db
    .select({ enabledOps: sapEntityConfigs.enabledOps })
    .from(sapEntityConfigs)
    .where(and(eq(sapEntityConfigs.tenantId, tenantId), eq(sapEntityConfigs.entitySet, entitySet)))
    .limit(1);
  if (!row || !row.enabledOps.includes(op)) {
    throw new EntityNotAllowedError(entitySet, op);
  }
}

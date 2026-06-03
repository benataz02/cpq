import { and, eq } from 'drizzle-orm';
import { getContext } from '@cpq/core/server';
import { db } from './client.js';
import { mappingLog } from './schema.js';

export type MappingLogRow = typeof mappingLog.$inferSelect;

export interface InsertPendingInput {
  idempotencyKey: string;
  sapObjectType: string;
  configId?: string;
  payload: Record<string, unknown>;
}

export interface CommitInput {
  sapDocEntry: number;
  sapDocNum: number | null;
  response: Record<string, unknown>;
}

// Repo over mapping_log. Tenant comes from the ALS request context (same pattern
// as withTenant). The (tenantId, idempotencyKey) unique index dedups commits.
export const mappingLogRepo = {
  async findByIdempotencyKey(idempotencyKey: string): Promise<MappingLogRow | undefined> {
    const { tenantId } = getContext();
    const rows = await db
      .select()
      .from(mappingLog)
      .where(and(eq(mappingLog.tenantId, tenantId), eq(mappingLog.idempotencyKey, idempotencyKey)))
      .limit(1);
    return rows[0];
  },

  async insertPending(input: InsertPendingInput): Promise<MappingLogRow> {
    const { tenantId, requestId } = getContext();
    const [row] = await db
      .insert(mappingLog)
      .values({
        tenantId,
        requestId,
        idempotencyKey: input.idempotencyKey,
        sapObjectType: input.sapObjectType,
        configId: input.configId,
        payload: input.payload,
        status: 'pending',
      })
      .returning();
    return row;
  },

  async markCommitted(id: string, input: CommitInput): Promise<MappingLogRow> {
    const { tenantId } = getContext();
    const [row] = await db
      .update(mappingLog)
      .set({
        status: 'committed',
        sapDocEntry: input.sapDocEntry,
        sapDocNum: input.sapDocNum,
        response: input.response,
        updatedAt: new Date(),
      })
      .where(and(eq(mappingLog.id, id), eq(mappingLog.tenantId, tenantId)))
      .returning();
    return row;
  },

  async markFailed(id: string, response: Record<string, unknown>): Promise<void> {
    const { tenantId } = getContext();
    await db
      .update(mappingLog)
      .set({ status: 'failed', response, updatedAt: new Date() })
      .where(and(eq(mappingLog.id, id), eq(mappingLog.tenantId, tenantId)));
  },
};

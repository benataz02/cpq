import { getContext } from '@cpq/core/server';
import { db } from './client.js';
import { auditLog } from './schema.js';

export interface AuditEntry {
  action: string;
  entity?: string;
  entityId?: string;
  actor?: string;
  data?: Record<string, unknown>;
}

// Append-only. tenantId + requestId come from the ALS request context so every
// trail entry correlates with its originating request. No UPDATE/DELETE.
export async function appendAudit(entry: AuditEntry): Promise<void> {
  const { tenantId, requestId, userId } = getContext();
  await db.insert(auditLog).values({
    tenantId,
    requestId,
    actor: entry.actor ?? userId,
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId,
    data: entry.data ?? {},
  });
}

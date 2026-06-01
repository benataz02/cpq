import { implement, ORPCError } from '@orpc/server';
import { contract } from '@cpq/contract';
import type { DiscoveredEntity } from '@cpq/contract';
import { getContext, logger } from '@cpq/core/server';
import {
  assertOpAllowed,
  getOrCreateTenantId,
  listEntityConfigs,
  upsertEntityConfig,
  EntityNotAllowedError,
  auditLog,
  db,
} from '@cpq/db';
import {
  getSapGateway,
  sapRegistry,
  describeEntity,
  SapValidationError,
  SapHttpError,
  SapAuthError,
} from '@cpq/sap-b1';

// IMPLEMENT the shared contract — this module owns ONLY the `sap.*` subtree; the
// root router (router.ts) merges it alongside `system`/`framework`.
const os = implement(contract);

/**
 * Best-effort, fire-and-forget audit. Resolves the slug→uuid tenant id, then appends one `audit_log` row.
 * Wrapped in try/catch → `logger.warn`; it NEVER throws and NEVER rejects, so a `void audit(...)` call can never
 * fail a write that already succeeded against SAP. Always invoked as `void audit(...)`.
 */
async function audit(
  action: string,
  entity: string,
  entityId: string | undefined,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const { tenantId, requestId } = getContext();
    const dbTenant = await getOrCreateTenantId(tenantId);
    await db.insert(auditLog).values({ tenantId: dbTenant, requestId, action, entity, entityId, data });
  } catch (e) {
    logger.warn({ err: e, action, entity, entityId }, 'sap audit failed (best-effort)');
  }
}

/**
 * Map a thrown sap-b1 / allowlist error onto the right oRPC error code:
 * - `EntityNotAllowedError` → FORBIDDEN (the tenant did not allowlist this op).
 * - `SapValidationError`    → BAD_REQUEST, carrying the structural `issues`.
 * - `SapHttpError` 412      → CONFLICT (optimistic-concurrency / ETag mismatch).
 * - other `SapHttpError` / `SapAuthError` → BAD_GATEWAY (upstream SAP failure).
 * Anything else re-throws unchanged (becomes a 500 — a genuine bug, not an upstream condition).
 */
function mapErr(e: unknown): never {
  if (e instanceof EntityNotAllowedError) {
    throw new ORPCError('FORBIDDEN', { message: e.message });
  }
  if (e instanceof SapValidationError) {
    throw new ORPCError('BAD_REQUEST', { message: e.message, data: { issues: e.issues } });
  }
  if (e instanceof SapAuthError) {
    throw new ORPCError('BAD_GATEWAY', { message: e.message });
  }
  if (e instanceof SapHttpError) {
    if (e.status === 412) throw new ORPCError('CONFLICT', { message: e.message });
    throw new ORPCError('BAD_GATEWAY', { message: e.message });
  }
  throw e;
}

/** Run `fn`, funnelling any thrown sap-b1/allowlist error through {@link mapErr}. */
async function guard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    mapErr(e);
  }
}

export const sapRouter = os.sap.router({
  metadata: {
    refresh: os.sap.metadata.refresh.handler(async () => {
      const { tenantId } = getContext();
      const meta = await guard(() => sapRegistry.getStore(tenantId).refresh());
      const dbTenant = await getOrCreateTenantId(tenantId);
      const configs = await listEntityConfigs(dbTenant);
      return { entities: mergeDiscovered([...meta.entitySets.values()], configs) };
    }),
    entities: os.sap.metadata.entities.handler(async () => {
      const { tenantId } = getContext();
      const meta = await guard(() => sapRegistry.getStore(tenantId).get());
      const dbTenant = await getOrCreateTenantId(tenantId);
      const configs = await listEntityConfigs(dbTenant);
      return { entities: mergeDiscovered([...meta.entitySets.values()], configs) };
    }),
    describe: os.sap.metadata.describe.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const meta = await guard(() => sapRegistry.getStore(tenantId).get());
      const d = describeEntity(meta, input.entitySet);
      return {
        entitySet: d.entitySet,
        keys: d.keys.map((k) => k.name),
        jsonSchema: d.jsonSchema as unknown as Record<string, unknown>,
        enums: Object.fromEntries(
          Object.entries(d.enums).map(([n, ms]) => [n, ms.map((m) => m.name)]),
        ),
        hasActions: d.hasActions,
        actions: d.actions,
      };
    }),
  },
  entityConfig: {
    list: os.sap.entityConfig.list.handler(async () => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      const rows = await listEntityConfigs(dbTenant);
      return {
        configs: rows.map((r) => ({
          entitySet: r.entitySet,
          enabledOps: r.enabledOps,
          labelField: r.labelField ?? undefined,
        })),
      };
    }),
    upsert: os.sap.entityConfig.upsert.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await upsertEntityConfig(dbTenant, input.entitySet, input.enabledOps, input.labelField);
      void audit('entityConfig.upsert', input.entitySet, input.entitySet, { ...input });
      return input;
    }),
  },
  entity: {
    list: os.sap.entity.list.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await guard(() => assertOpAllowed(dbTenant, input.entitySet, 'read'));
      const gw = getSapGateway(tenantId);
      const page = await guard(() => gw.list(input.entitySet, input.query));
      return { records: page.value, nextLink: page.nextLink };
    }),
    get: os.sap.entity.get.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await guard(() => assertOpAllowed(dbTenant, input.entitySet, 'read'));
      const gw = getSapGateway(tenantId);
      const r = await guard(() => gw.get(input.entitySet, input.key));
      return { record: r.data, etag: r.etag };
    }),
    create: os.sap.entity.create.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await guard(() => assertOpAllowed(dbTenant, input.entitySet, 'create'));
      const gw = getSapGateway(tenantId);
      const r = await guard(() => gw.create(input.entitySet, input.data));
      void audit('entity.create', input.entitySet, undefined, { record: r.data });
      return { record: r.data, etag: r.etag };
    }),
    update: os.sap.entity.update.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await guard(() => assertOpAllowed(dbTenant, input.entitySet, 'update'));
      const gw = getSapGateway(tenantId);
      const current = await guard(() => gw.get(input.entitySet, input.key));
      const r = await guard(() =>
        gw.update(input.entitySet, input.key, input.patch, { etag: current.etag ?? '*' }),
      );
      void audit('entity.update', input.entitySet, keyToId(input.key), { patch: input.patch });
      return { record: r.data, etag: r.etag };
    }),
    delete: os.sap.entity.delete.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await guard(() => assertOpAllowed(dbTenant, input.entitySet, 'delete'));
      const gw = getSapGateway(tenantId);
      const current = await guard(() => gw.get(input.entitySet, input.key));
      await guard(() => gw.del(input.entitySet, input.key, { etag: current.etag ?? '*' }));
      void audit('entity.delete', input.entitySet, keyToId(input.key), {});
      return { deleted: true };
    }),
    action: os.sap.entity.action.handler(async ({ input }) => {
      const { tenantId } = getContext();
      const dbTenant = await getOrCreateTenantId(tenantId);
      await guard(() => assertOpAllowed(dbTenant, input.entitySet, 'action'));
      const gw = getSapGateway(tenantId);
      const r = await guard(() => gw.callAction(input.entitySet, input.key, input.action));
      void audit('entity.action', input.entitySet, keyToId(input.key), { action: input.action });
      return { record: r.data, etag: r.etag };
    }),
  },
});

/** A composite/scalar entity key → a stable string id for the audit row. */
function keyToId(key: unknown): string {
  return typeof key === 'object' && key !== null ? JSON.stringify(key) : String(key);
}

/** Merge the discovered entity sets with the per-tenant allowlist configs into `DiscoveredEntity[]`. */
function mergeDiscovered(
  sets: { name: string; actions: string[] }[],
  configs: { entitySet: string; enabledOps: ('read' | 'create' | 'update' | 'delete' | 'action')[] }[],
): DiscoveredEntity[] {
  const byName = new Map(configs.map((c) => [c.entitySet, c]));
  return sets.map((s) => {
    const cfg = byName.get(s.name);
    return {
      entitySet: s.name,
      enabled: !!cfg && cfg.enabledOps.length > 0,
      enabledOps: cfg?.enabledOps ?? [],
      hasActions: s.actions.length > 0,
    };
  });
}

import { describe, expect, it } from 'vitest';
import {
  listEntityConfigs,
  upsertEntityConfig,
  assertOpAllowed,
  EntityNotAllowedError,
} from '../src/repos/entityConfig';
import { getOrCreateTenantId } from '../src/repos/tenant';

// DATABASE_URL-gated: with no DB present the whole-repo `turbo run test` stays
// green (client.ts is side-effect-free without DATABASE_URL).
describe.skipIf(!process.env.DATABASE_URL)('entity-config + tenant repos', () => {
  it('round-trips configs, gates ops, and resolves a stable tenant id', async () => {
    const tenantId = await getOrCreateTenantId('demo');
    expect(tenantId).toMatch(/^[0-9a-f-]{36}$/);

    await upsertEntityConfig(tenantId, 'BusinessPartners', ['read', 'create']);

    const configs = await listEntityConfigs(tenantId);
    const bp = configs.find((c) => c.entitySet === 'BusinessPartners');
    expect(bp).toBeDefined();
    expect(bp!.enabledOps.sort()).toEqual(['create', 'read']);

    await expect(assertOpAllowed(tenantId, 'BusinessPartners', 'read')).resolves.toBeUndefined();
    await expect(assertOpAllowed(tenantId, 'BusinessPartners', 'delete')).rejects.toBeInstanceOf(
      EntityNotAllowedError,
    );

    // upsert again with different ops updates enabledOps (no duplicate row).
    await upsertEntityConfig(tenantId, 'BusinessPartners', ['read', 'update', 'delete']);
    const afterUpdate = await listEntityConfigs(tenantId);
    const bp2 = afterUpdate.filter((c) => c.entitySet === 'BusinessPartners');
    expect(bp2).toHaveLength(1);
    expect(bp2[0]!.enabledOps.sort()).toEqual(['delete', 'read', 'update']);
    await expect(assertOpAllowed(tenantId, 'BusinessPartners', 'delete')).resolves.toBeUndefined();
    await expect(assertOpAllowed(tenantId, 'BusinessPartners', 'create')).rejects.toBeInstanceOf(
      EntityNotAllowedError,
    );

    // getOrCreateTenantId is stable across calls.
    const again = await getOrCreateTenantId('demo');
    expect(again).toBe(tenantId);
  });
});

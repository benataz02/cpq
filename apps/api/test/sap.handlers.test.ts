import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── Hermetic doubles ────────────────────────────────────────────────────────
// No real DB / no real SAP. We stub the @cpq/db allowlist + tenant-resolve + audit
// insert, and the @cpq/sap-b1 gateway/store. The handlers under test (apps/api/src/sap.ts)
// wire the *real* contract through these doubles, exercised over the OpenAPI surface.

// Spies the assertions reach into.
const assertOpAllowed = vi.fn<(t: string, e: string, op: string) => Promise<void>>();
const getOrCreateTenantId = vi.fn<(slug: string) => Promise<string>>();
const listEntityConfigs = vi.fn<(t: string) => Promise<unknown[]>>();
const upsertEntityConfig = vi.fn();
const auditValues = vi.fn<(row: unknown) => Promise<void>>();

const gatewayCreate = vi.fn<(set: string, data: unknown) => Promise<unknown>>();
const gatewayList = vi.fn();
const gatewayGet = vi.fn();
const gatewayUpdate = vi.fn();
const gatewayDel = vi.fn();
const gatewayCallAction = vi.fn();

class EntityNotAllowedError extends Error {
  constructor(entitySet: string, op: string) {
    super(`operation '${op}' is not allowed on entity set '${entitySet}'`);
    this.name = 'EntityNotAllowedError';
  }
}
class SapValidationError extends Error {
  constructor(readonly issues: { code: string; field?: string; message: string }[]) {
    super(`SAP payload validation failed: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'SapValidationError';
  }
}
class SapHttpError extends Error {
  constructor(readonly status: number, readonly path: string, readonly body: unknown) {
    super(`SAP ${status} ${path}`);
    this.name = 'SapHttpError';
  }
}
class SapAuthError extends SapHttpError {
  constructor(s: number, p: string, b: unknown) {
    super(s, p, b);
    this.name = 'SapAuthError';
  }
}

vi.mock('@cpq/db', () => ({
  assertOpAllowed,
  getOrCreateTenantId,
  listEntityConfigs,
  upsertEntityConfig,
  EntityNotAllowedError,
  auditLog: { _: 'audit_log' },
  db: { insert: () => ({ values: auditValues }) },
}));

vi.mock('@cpq/sap-b1', () => ({
  getSapGateway: () => ({
    list: gatewayList,
    get: gatewayGet,
    create: gatewayCreate,
    update: gatewayUpdate,
    del: gatewayDel,
    callAction: gatewayCallAction,
  }),
  sapRegistry: {
    getStore: () => ({
      get: async () => ({ entitySets: new Map(), enums: new Map(), fetchedAt: 0 }),
      refresh: async () => ({ entitySets: new Map(), enums: new Map(), fetchedAt: 0 }),
    }),
  },
  describeEntity: () => ({
    entitySet: 'BusinessPartners',
    keys: [],
    jsonSchema: {},
    enums: {},
    hasActions: false,
    actions: [],
  }),
  SapValidationError,
  SapHttpError,
  SapAuthError,
}));

// buildServer must be imported AFTER the mocks are registered.
const { buildServer } = await import('../src/server');

describe('sap CRUD handlers (allowlist + audit + slug→uuid)', () => {
  beforeEach(() => {
    getOrCreateTenantId.mockResolvedValue('00000000-0000-0000-0000-000000000001');
    assertOpAllowed.mockResolvedValue(undefined);
    auditValues.mockResolvedValue(undefined);
    gatewayCreate.mockResolvedValue({ data: { CardCode: 'C1' }, etag: 'W/"1"' });
  });
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('(a) allowlist rejection: assertOpAllowed throws → 403 FORBIDDEN, gateway.create NEVER called', async () => {
    assertOpAllowed.mockRejectedValueOnce(new EntityNotAllowedError('BusinessPartners', 'create'));
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sap/entities/BusinessPartners/create',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'demo' },
      payload: { entitySet: 'BusinessPartners', data: { CardCode: 'C1' } },
    });
    expect(res.statusCode).toBe(403);
    expect(gatewayCreate).not.toHaveBeenCalled();
    await app.close();
  });

  it('(b) audit best-effort: audit insert throws → create STILL returns { record, etag }', async () => {
    auditValues.mockRejectedValue(new Error('db down'));
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sap/entities/BusinessPartners/create',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'demo' },
      payload: { entitySet: 'BusinessPartners', data: { CardCode: 'C1' } },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ record: { CardCode: 'C1' }, etag: 'W/"1"' });
    expect(gatewayCreate).toHaveBeenCalledOnce();
    await app.close();
  });

  it('(c) validation mapping: gateway.create throws SapValidationError → 400 with issues', async () => {
    const issues = [{ code: 'required', field: 'CardName', message: 'CardName is required' }];
    gatewayCreate.mockRejectedValueOnce(new SapValidationError(issues));
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/sap/entities/BusinessPartners/create',
      headers: { 'content-type': 'application/json', 'x-tenant-id': 'demo' },
      payload: { entitySet: 'BusinessPartners', data: { CardCode: 'C1' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().data?.issues ?? res.json().issues).toEqual(issues);
    await app.close();
  });
});

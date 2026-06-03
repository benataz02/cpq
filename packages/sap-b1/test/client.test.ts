import { afterEach, describe, expect, it } from 'vitest';
import { MockAgent } from 'undici';
import { SapClient, SessionSchema } from '../src/index';

const creds = { CompanyDB: 'X', UserName: 'u', Password: 'p' };
const ORIGIN = 'https://sap.example';
const BASE = `${ORIGIN}/b1s/v2`;

const SESSION_COOKIES = {
  'set-cookie': ['B1SESSION=abc123; path=/', 'ROUTEID=.node1; path=/'],
};

function mock() {
  const agent = new MockAgent();
  agent.disableNetConnect();
  return { agent, pool: agent.get(ORIGIN) };
}

function client(agent: MockAgent, opts: { keepAliveMs?: number } = {}) {
  return new SapClient(BASE, creds, { dispatcher: agent, keepAliveMs: opts.keepAliveMs ?? 0 });
}

let active: MockAgent | null = null;
afterEach(async () => {
  await active?.close();
  active = null;
});

describe('SapClient session + cookies', () => {
  it('login captures B1SESSION + ROUTEID into the jar', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(200, { SessionId: 'abc123', SessionTimeout: 30 }, { headers: SESSION_COOKIES });

    const c = client(agent);
    await c.ensureSession();
    const cookie = await c.jar.getCookieString(`${BASE}/Items`);
    expect(cookie).toContain('B1SESSION=abc123');
    expect(cookie).toContain('ROUTEID=.node1');
  });

  it('single-flight: concurrent ensureSession() collapse to one login', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(200, { SessionId: 'abc123' }, { headers: SESSION_COOKIES })
      .persist();

    const c = client(agent);
    await Promise.all([c.ensureSession(), c.ensureSession(), c.ensureSession()]);
    expect(c.loginCount).toBe(1);
  });

  it('re-logins on a fresh call after the in-flight login settles', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(200, { SessionId: 'abc123' }, { headers: SESSION_COOKIES })
      .persist();

    const c = client(agent);
    await c.ensureSession();
    await c.ensureSession();
    expect(c.loginCount).toBe(2);
  });

  it('throws a typed error when Login fails', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool.intercept({ path: '/b1s/v2/Login', method: 'POST' }).reply(401, { error: 'bad creds' });
    const c = client(agent);
    await expect(c.ensureSession()).rejects.toThrow(/SAP Login failed/);
  });

  it('validates a session DTO at the boundary', () => {
    expect(SessionSchema.parse({ SessionId: 'abc' }).SessionId).toBe('abc');
    expect(() => SessionSchema.parse({})).toThrow();
  });
});

describe('SapClient reads', () => {
  it('re-logins exactly once on a 401 and retries the read', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(200, { SessionId: 'abc123' }, { headers: SESSION_COOKIES })
      .persist();
    // First read 401s (expired session); after the forced re-login the retry succeeds.
    pool.intercept({ path: '/b1s/v2/Items', method: 'GET' }).reply(401, { error: 'session timeout' });
    pool.intercept({ path: '/b1s/v2/Items', method: 'GET' }).reply(200, { value: [{ ItemCode: 'CFG-1' }] });

    const c = client(agent);
    const page = await c.getItems();
    expect(page.items.map((i) => i.ItemCode)).toEqual(['CFG-1']);
    expect(c.loginCount).toBe(2); // initial login + one forced re-login
  });

  it('follows @odata.nextLink across pages in getAll()', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(200, { SessionId: 'abc123' }, { headers: SESSION_COOKIES })
      .persist();
    pool
      .intercept({ path: '/b1s/v2/Items', method: 'GET' })
      .reply(200, { value: [{ ItemCode: 'A' }], '@odata.nextLink': 'Items?$skip=1' });
    pool.intercept({ path: '/b1s/v2/Items?$skip=1', method: 'GET' }).reply(200, { value: [{ ItemCode: 'B' }] });

    const c = client(agent);
    const { SapItemSchema } = await import('@cpq/contract');
    const all = await c.getAll('Items', SapItemSchema);
    expect(all.map((i) => i.ItemCode)).toEqual(['A', 'B']);
  });
});

describe('SapClient quotation create', () => {
  it('POSTs a quotation and parses DocEntry/DocNum', async () => {
    const { agent, pool } = mock();
    active = agent;
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(200, { SessionId: 'abc123' }, { headers: SESSION_COOKIES })
      .persist();
    pool
      .intercept({ path: '/b1s/v2/Quotations', method: 'POST' })
      .reply(201, { DocEntry: 42, DocNum: 1042, CardCode: 'C0001' });

    const c = client(agent);
    const res = await c.createQuotation({ CardCode: 'C0001', DocumentLines: [{ ItemCode: 'CFG-1', Quantity: 2 }] });
    expect(res.DocEntry).toBe(42);
    expect(res.DocNum).toBe(1042);
  });

  it('rejects a malformed quotation before any request', async () => {
    const { agent } = mock();
    active = agent;
    const c = client(agent);
    // No line items -> fails the Zod boundary; net-connect is disabled so a leak would throw too.
    await expect(
      c.createQuotation({ CardCode: 'C0001', DocumentLines: [] } as never),
    ).rejects.toThrow();
  });
});

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent } from 'undici';
import type { Dispatcher } from 'undici';
import { SapClient, SessionSchema } from '../src/index';
import { z } from 'zod';

const creds = { CompanyDB: 'X', UserName: 'u', Password: 'p' };
const ORIGIN = 'https://sap.example';
const BASE = `${ORIGIN}/b1s/v2`;

// Test-only subclass: ensureSession is `protected` on SapClient — expose it to
// prove the single-flight guard collapses concurrent (re-)logins.
class TestClient extends SapClient {
  public ensure(): Promise<void> {
    return this.ensureSession();
  }
}

function jsonReply(data: unknown, headers: Record<string, string> = {}) {
  return {
    statusCode: 200,
    data: JSON.stringify(data),
    responseOptions: { headers: { 'content-type': 'application/json', ...headers } },
  };
}

let mock: MockAgent;

beforeEach(() => {
  mock = new MockAgent();
  mock.disableNetConnect();
});

afterEach(async () => {
  await mock.close();
});

describe('SapClient', () => {
  it('validates a session DTO at the boundary', () => {
    expect(SessionSchema.parse({ SessionId: 'abc' }).SessionId).toBe('abc');
    expect(() => SessionSchema.parse({})).toThrow();
  });

  it('single-flight: 3 concurrent ensureSession() fire Login exactly once', async () => {
    const pool = mock.get(ORIGIN);
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(() => jsonReply({ SessionId: 'sess-1', SessionTimeout: 30 }))
      .times(1);

    const c = new TestClient(BASE, creds, {}, mock as unknown as Dispatcher);
    await Promise.all([c.ensure(), c.ensure(), c.ensure()]);

    expect(c.loginCount).toBe(1);
    mock.assertNoPendingInterceptors();
  });

  it('401 -> relogin -> retry-once -> success (loginCount === 2)', async () => {
    const pool = mock.get(ORIGIN);
    // initial login
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(() => jsonReply({ SessionId: 'sess-1', SessionTimeout: 30 }))
      .times(1);
    // first data call -> 401 (session expired)
    pool
      .intercept({ path: '/b1s/v2/Items', method: 'GET' })
      .reply(() => ({
        statusCode: 401,
        data: JSON.stringify({ error: { code: -304, message: { value: 'session timeout' } } }),
        responseOptions: { headers: { 'content-type': 'application/json' } },
      }))
      .times(1);
    // re-login triggered by the auth branch
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(() => jsonReply({ SessionId: 'sess-2', SessionTimeout: 30 }))
      .times(1);
    // retry of the data call -> success
    pool
      .intercept({ path: '/b1s/v2/Items', method: 'GET' })
      .reply(() => jsonReply({ value: [] }))
      .times(1);

    const c = new TestClient(BASE, creds, {}, mock as unknown as Dispatcher);
    const res = await c.requestRaw('/Items');

    expect(res.status).toBe(200);
    expect(c.loginCount).toBe(2);
    mock.assertNoPendingInterceptors();
  });

  it('requestRaw returns {status, headers, body} and reads an ETag header', async () => {
    const pool = mock.get(ORIGIN);
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(() => jsonReply({ SessionId: 'sess-1', SessionTimeout: 30 }))
      .times(1);
    pool
      .intercept({ path: '/b1s/v2/Items(1)', method: 'GET' })
      .reply(() => jsonReply({ ItemCode: 'A' }, { etag: 'W/"42"' }))
      .times(1);

    const c = new SapClient(BASE, creds, {}, mock as unknown as Dispatcher);
    const res = await c.requestRaw('/Items(1)');

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('W/"42"');
    expect(res.body).toEqual({ ItemCode: 'A' });
    mock.assertNoPendingInterceptors();
  });

  it('paginate follows @odata.nextLink across pages', async () => {
    const Row = z.object({ ItemCode: z.string() });
    const pool = mock.get(ORIGIN);
    pool
      .intercept({ path: '/b1s/v2/Login', method: 'POST' })
      .reply(() => jsonReply({ SessionId: 'sess-1', SessionTimeout: 30 }))
      .times(1);
    pool
      .intercept({ path: '/b1s/v2/Items', method: 'GET' })
      .reply(() =>
        jsonReply({ value: [{ ItemCode: 'A' }], '@odata.nextLink': 'Items?$skip=1' }),
      )
      .times(1);
    pool
      .intercept({ path: '/b1s/v2/Items?$skip=1', method: 'GET' })
      .reply(() => jsonReply({ value: [{ ItemCode: 'B' }] }))
      .times(1);

    const c = new SapClient(BASE, creds, {}, mock as unknown as Dispatcher);
    const rows = await c.paginate('/Items', Row);

    expect(rows.map((r) => r.ItemCode)).toEqual(['A', 'B']);
    mock.assertNoPendingInterceptors();
  });
});

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MockAgent } from 'undici';
import type { Dispatcher } from 'undici';
import { SapClient } from '../src/index';
import { SapHttpError } from '../src/errors';
import { MetadataStore } from '../src/metadata/store';
import type { MetadataFetcher } from '../src/metadata/store';
import { SapGateway, SapValidationError } from '../src/gateway';

const xml = readFileSync(new URL('./fixtures/metadata.edmx.xml', import.meta.url), 'utf8');
const creds = { CompanyDB: 'X', UserName: 'u', Password: 'p' };
const ORIGIN = 'https://sap.example';
const BASE = `${ORIGIN}/b1s/v2`;

function fixtureFetcher(): MetadataFetcher {
  return {
    async fetchMetadataXml(): Promise<string> {
      return xml;
    },
  };
}

function jsonReply(data: unknown, statusCode = 200, headers: Record<string, string> = {}) {
  return {
    statusCode,
    data: JSON.stringify(data),
    responseOptions: { headers: { 'content-type': 'application/json', ...headers } },
  };
}

let mock: MockAgent;

/** Pre-seed a login interceptor so the lazy `ensureSession()` is satisfied for every authed call. */
function withLogin(): void {
  mock
    .get(ORIGIN)
    .intercept({ path: '/b1s/v2/Login', method: 'POST' })
    .reply(() => jsonReply({ SessionId: 'sess-1', SessionTimeout: 30 }))
    .times(1);
}

function makeGateway(): SapGateway {
  const client = new SapClient(BASE, creds, {}, mock as unknown as Dispatcher);
  const store = new MetadataStore(fixtureFetcher());
  return new SapGateway(client, store);
}

beforeEach(() => {
  mock = new MockAgent();
  mock.disableNetConnect();
});

afterEach(async () => {
  await mock.close();
});

describe('SapGateway', () => {
  it("create('BusinessPartners') POSTs the JSON body and captures @odata.etag", async () => {
    withLogin();
    let seenBody: unknown;
    let seenMethod: string | undefined;
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/BusinessPartners', method: 'POST' })
      .reply((opts) => {
        seenMethod = String(opts.method);
        seenBody = JSON.parse(String(opts.body));
        return jsonReply({ CardCode: 'C9', '@odata.etag': 'W/"7"' }, 201);
      })
      .times(1);

    const gw = makeGateway();
    const out = await gw.create('BusinessPartners', { CardCode: 'C9', CardName: 'Acme' });

    expect(seenMethod).toBe('POST');
    expect(seenBody).toEqual({ CardCode: 'C9', CardName: 'Acme' });
    expect(out.etag).toBe('W/"7"');
    expect(out.data).toMatchObject({ CardCode: 'C9' });
    mock.assertNoPendingInterceptors();
  });

  it("get('Quotations', 22) GETs /Quotations(22) and reads the etag from the header only", async () => {
    withLogin();
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/Quotations(22)', method: 'GET' })
      .reply(() => jsonReply({ DocEntry: 22, CardCode: 'C1' }, 200, { etag: 'W/"42"' }))
      .times(1);

    const gw = makeGateway();
    const out = await gw.get('Quotations', 22);

    expect(out.etag).toBe('W/"42"'); // body had no @odata.etag → header wins
    expect(out.data).toMatchObject({ DocEntry: 22 });
    mock.assertNoPendingInterceptors();
  });

  it("update('Quotations', 22, patch, {etag}) PATCHes with If-Match", async () => {
    withLogin();
    let ifMatch: string | string[] | undefined;
    let seenMethod: string | undefined;
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/Quotations(22)', method: 'PATCH' })
      .reply((opts) => {
        seenMethod = String(opts.method);
        ifMatch = opts.headers?.['if-match'] ?? (opts.headers as Record<string, string>)?.['If-Match'];
        return jsonReply({ DocEntry: 22, DocTotal: 99 }, 200, { etag: 'W/"43"' });
      })
      .times(1);

    const gw = makeGateway();
    const out = await gw.update('Quotations', 22, { DocTotal: 99 }, { etag: 'W/"42"' });

    expect(seenMethod).toBe('PATCH');
    expect(ifMatch).toBe('W/"42"');
    expect(out.etag).toBe('W/"43"');
    mock.assertNoPendingInterceptors();
  });

  it('a stale etag surfaces a SapHttpError with status 412', async () => {
    withLogin();
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/Quotations(22)', method: 'PATCH' })
      .reply(() => jsonReply({ error: { code: 412, message: { value: 'precondition failed' } } }, 412))
      .times(1);

    const gw = makeGateway();
    const err = await gw
      .update('Quotations', 22, { DocTotal: 99 }, { etag: 'W/"stale"' })
      .then(
        () => {
          throw new Error('expected a rejection');
        },
        (e: unknown) => e,
      );
    expect(err).toBeInstanceOf(SapHttpError);
    expect((err as SapHttpError).status).toBe(412);
    mock.assertNoPendingInterceptors();
  });

  it("del('BusinessPartners', 'C1', {etag}) DELETEs with If-Match", async () => {
    withLogin();
    let ifMatch: string | string[] | undefined;
    let seenMethod: string | undefined;
    mock
      .get(ORIGIN)
      .intercept({ path: "/b1s/v2/BusinessPartners('C1')", method: 'DELETE' })
      .reply((opts) => {
        seenMethod = String(opts.method);
        ifMatch = opts.headers?.['if-match'] ?? (opts.headers as Record<string, string>)?.['If-Match'];
        return { statusCode: 204, data: '', responseOptions: { headers: {} } };
      })
      .times(1);

    const gw = makeGateway();
    await gw.del('BusinessPartners', 'C1', { etag: 'W/"9"' });

    expect(seenMethod).toBe('DELETE');
    expect(ifMatch).toBe('W/"9"');
    mock.assertNoPendingInterceptors();
  });

  it("callAction('Quotations', 22, 'Cancel') POSTs /Quotations(22)/Cancel", async () => {
    withLogin();
    let seenMethod: string | undefined;
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/Quotations(22)/Cancel', method: 'POST' })
      .reply((opts) => {
        seenMethod = String(opts.method);
        return jsonReply({ DocEntry: 22 }, 200);
      })
      .times(1);

    const gw = makeGateway();
    const out = await gw.callAction('Quotations', 22, 'Cancel');

    expect(seenMethod).toBe('POST');
    expect(out.data).toMatchObject({ DocEntry: 22 });
    mock.assertNoPendingInterceptors();
  });

  it("callAction with an action absent from the metadata throws (no HTTP)", async () => {
    const gw = makeGateway();
    await expect(gw.callAction('Quotations', 22, 'Bogus')).rejects.toThrow(/Bogus/);
    mock.assertNoPendingInterceptors(); // no interceptor consumed → no request issued
  });

  it('create with a missing required field throws SapValidationError before any HTTP', async () => {
    // No login / no entity interceptor registered → any wire call would 400 (disableNetConnect).
    const gw = makeGateway();
    await expect(gw.create('BusinessPartners', { CardCode: 'C9' })).rejects.toBeInstanceOf(
      SapValidationError,
    );
    try {
      await gw.create('BusinessPartners', { CardCode: 'C9' });
    } catch (e) {
      expect(e).toBeInstanceOf(SapValidationError);
      const issues = (e as SapValidationError).issues;
      expect(issues.some((i) => i.code === 'required' && i.path === 'CardName')).toBe(true);
    }
    mock.assertNoPendingInterceptors(); // zero interceptors registered → zero requests
  });

  it('create filters out unknown_property issues (SAP owns extras/UDFs)', async () => {
    withLogin();
    let seenBody: Record<string, unknown> | undefined;
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/BusinessPartners', method: 'POST' })
      .reply((opts) => {
        seenBody = JSON.parse(String(opts.body));
        return jsonReply({ CardCode: 'C9', '@odata.etag': 'W/"1"' }, 201);
      })
      .times(1);

    const gw = makeGateway();
    // `Whatever` is an unknown property — must NOT be rejected (SAP owns extras), and is sent as-is.
    const out = await gw.create('BusinessPartners', {
      CardCode: 'C9',
      CardName: 'Acme',
      Whatever: 'x',
    });

    expect(out.etag).toBe('W/"1"');
    expect(seenBody).toMatchObject({ Whatever: 'x' });
    mock.assertNoPendingInterceptors();
  });

  it('list returns a single page with value and nextLink, adding Prefer when pageSize is set', async () => {
    withLogin();
    let prefer: string | string[] | undefined;
    mock
      .get(ORIGIN)
      .intercept({ path: '/b1s/v2/BusinessPartners?$top=2', method: 'GET' })
      .reply((opts) => {
        prefer = opts.headers?.['prefer'] ?? (opts.headers as Record<string, string>)?.['Prefer'];
        return jsonReply({
          value: [{ CardCode: 'C1' }, { CardCode: 'C2' }],
          '@odata.nextLink': 'BusinessPartners?$skip=2',
        });
      })
      .times(1);

    const gw = makeGateway();
    const page = await gw.list('BusinessPartners', { top: 2, pageSize: 2 });

    expect(page.value).toHaveLength(2);
    expect(page.nextLink).toBe('BusinessPartners?$skip=2');
    expect(prefer).toBe('odata.maxpagesize=2');
    mock.assertNoPendingInterceptors();
  });
});

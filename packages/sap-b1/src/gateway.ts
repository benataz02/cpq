import { z } from 'zod';
import type { SapClient, RawResponse } from './client.js';
import { ODataListSchema } from './wire.js';
import { MetadataStore } from './metadata/store.js';
import { formatEntityKey, type EntityKeyInput } from './metadata/key.js';
import { validateEntityPayload, type EntityIssue } from './metadata/validate.js';

/**
 * Write-side validation failure raised **before** any HTTP — the metadata-derived payload (in `create`/
 * `update`) had structural issues (missing required, wrong type, over-length, bad enum). `unknown_property`
 * issues are *filtered out* by the gateway (SAP owns extras/UDFs), so they never reach here.
 */
export class SapValidationError extends Error {
  constructor(readonly issues: EntityIssue[]) {
    super(`SAP payload validation failed: ${issues.map((i) => i.message).join('; ')}`);
    this.name = 'SapValidationError';
  }
}

/** OData query knobs for `list`/`get`. `pageSize` maps to the `Prefer: odata.maxpagesize` server hint. */
export interface EntityQuery {
  filter?: string;
  select?: string | string[];
  orderby?: string | string[];
  expand?: string | string[];
  top?: number;
  skip?: number;
  pageSize?: number;
}

/** A single record plus its concurrency tag (OData `@odata.etag` annotation or the `ETag` response header). */
export interface RecordWithEtag<T = Record<string, unknown>> {
  data: T;
  etag?: string;
}

/** One `list` page: the row array plus the server's `@odata.nextLink` (if there are further pages). */
export interface EntityPage {
  value: Record<string, unknown>[];
  nextLink?: string;
}

/** Coalesce a `string | string[]` query value into a comma-joined OData literal. */
function joinList(v: string | string[]): string {
  return Array.isArray(v) ? v.join(',') : v;
}

/** Build the `?$...` query string for a request (omitted entirely when no knobs are set). `pageSize` is a header, not a query option. */
function qs(query?: EntityQuery): string {
  if (!query) return '';
  const params = new URLSearchParams();
  if (query.filter !== undefined) params.set('$filter', query.filter);
  if (query.select !== undefined) params.set('$select', joinList(query.select));
  if (query.orderby !== undefined) params.set('$orderby', joinList(query.orderby));
  if (query.expand !== undefined) params.set('$expand', joinList(query.expand));
  if (query.top !== undefined) params.set('$top', String(query.top));
  if (query.skip !== undefined) params.set('$skip', String(query.skip));
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Resolve a record's etag: the body's `@odata.etag` annotation wins, else the `ETag` response header. */
function etagOf(res: RawResponse): string | undefined {
  const body = res.body;
  if (body && typeof body === 'object' && '@odata.etag' in body) {
    const v = (body as Record<string, unknown>)['@odata.etag'];
    if (typeof v === 'string') return v;
  }
  return res.headers.get('etag') ?? undefined;
}

/** A page schema over open records — the gateway is generic, so each row is a `Record<string, unknown>`. */
const PageSchema = ODataListSchema(z.record(z.string(), z.unknown()));

/**
 * The generic, metadata-driven Service Layer gateway: it ties the {@link SapClient} transport to the
 * {@link MetadataStore} (key formatting, payload validation, bound-action assertion). Every write is gated by
 * `validateEntityPayload` (minus `unknown_property`, since SAP owns extras/UDFs) **before** a wire round-trip.
 */
export class SapGateway {
  constructor(
    private readonly client: SapClient,
    private readonly metaStore: MetadataStore,
  ) {}

  /** Read **one** page of an entity set (caller follows `nextLink` for more). `pageSize` → `Prefer: odata.maxpagesize`. */
  async list(entitySet: string, query?: EntityQuery): Promise<EntityPage> {
    const headers: Record<string, string> = {};
    if (query?.pageSize !== undefined) {
      headers['Prefer'] = `odata.maxpagesize=${query.pageSize}`;
    }
    const res = await this.client.requestRaw(`/${entitySet}${qs(query)}`, { method: 'GET', headers });
    const page = PageSchema.parse(res.body);
    return { value: page.value, nextLink: page['@odata.nextLink'] };
  }

  /** Read a single entity by key, optionally `$expand`-ing navigation properties. */
  async get(
    entitySet: string,
    key: EntityKeyInput,
    query?: EntityQuery,
  ): Promise<RecordWithEtag> {
    const es = await this.metaStore.entitySet(entitySet);
    const seg = formatEntityKey(es, key);
    const search = qs(query?.expand !== undefined ? { expand: query.expand } : undefined);
    const res = await this.client.requestRaw(`/${entitySet}${seg}${search}`, { method: 'GET' });
    return { data: res.body as Record<string, unknown>, etag: etagOf(res) };
  }

  /** Create an entity: validate (`create`, minus `unknown_property`) → throw `SapValidationError` → POST JSON. */
  async create(entitySet: string, data: Record<string, unknown>): Promise<RecordWithEtag> {
    const meta = await this.metaStore.get();
    const issues = validateEntityPayload(meta, entitySet, 'create', data).filter(
      (i) => i.code !== 'unknown_property',
    );
    if (issues.length > 0) throw new SapValidationError(issues);
    const res = await this.client.requestRaw(`/${entitySet}`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: { 'content-type': 'application/json' },
    });
    return { data: res.body as Record<string, unknown>, etag: etagOf(res) };
  }

  /** Update an entity: validate (`update`, minus `unknown_property`) → PATCH by key with `If-Match`. */
  async update(
    entitySet: string,
    key: EntityKeyInput,
    patch: Record<string, unknown>,
    opts: { etag: string },
  ): Promise<RecordWithEtag> {
    const meta = await this.metaStore.get();
    const es = await this.metaStore.entitySet(entitySet);
    const issues = validateEntityPayload(meta, entitySet, 'update', patch).filter(
      (i) => i.code !== 'unknown_property',
    );
    if (issues.length > 0) throw new SapValidationError(issues);
    const seg = formatEntityKey(es, key);
    const res = await this.client.requestRaw(`/${entitySet}${seg}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      headers: { 'content-type': 'application/json', 'If-Match': opts.etag },
    });
    return { data: res.body as Record<string, unknown>, etag: etagOf(res) };
  }

  /** Delete an entity by key with `If-Match` (optimistic concurrency). */
  async del(entitySet: string, key: EntityKeyInput, opts: { etag: string }): Promise<void> {
    const es = await this.metaStore.entitySet(entitySet);
    const seg = formatEntityKey(es, key);
    await this.client.requestRaw(`/${entitySet}${seg}`, {
      method: 'DELETE',
      headers: { 'If-Match': opts.etag },
    });
  }

  /** Invoke a bound action on an entity: assert it exists in the metadata → POST `/<Set>(<key>)/<Action>`. */
  async callAction(
    entitySet: string,
    key: EntityKeyInput,
    action: string,
  ): Promise<RecordWithEtag> {
    const es = await this.metaStore.entitySet(entitySet);
    if (!es.actions.includes(action)) {
      throw new Error(`${entitySet}: unknown bound action '${action}'`);
    }
    const seg = formatEntityKey(es, key);
    const res = await this.client.requestRaw(`/${entitySet}${seg}/${action}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    return { data: res.body as Record<string, unknown>, etag: etagOf(res) };
  }
}

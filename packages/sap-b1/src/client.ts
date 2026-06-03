import { CookieJar } from 'tough-cookie';
import { request as undiciRequest } from 'undici';
import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';
import { AppError } from '@cpq/core';
import {
  SessionSchema,
  type Session,
  SapItemSchema,
  type SapItem,
  SapBusinessPartnerSchema,
  type SapBusinessPartner,
  SapProductTreeSchema,
  type SapProductTree,
  SapQuotationCreateSchema,
  type SapQuotationCreate,
  SapQuotationResultSchema,
  type SapQuotationResult,
  odataList,
} from '@cpq/contract';
import { defaultDispatcher, cookieHeader, captureSetCookies, type Dispatcher } from './transport.js';

export interface SapCreds {
  CompanyDB: string;
  UserName: string;
  Password: string;
}

export interface SapClientOptions {
  /** Injectable dispatcher — live: undici Agent; tests: undici MockAgent. */
  dispatcher?: Dispatcher;
  /** Keep-alive ping interval (ms). 0 disables (default in tests). */
  keepAliveMs?: number;
}

export interface ListPage<T> {
  items: T[];
  nextLink?: string;
}

interface ListQuery {
  skip?: number;
  top?: number;
  filter?: string;
}

const KEEPALIVE_DEFAULT_MS = 0; // opt-in: the API singleton sets a positive value.

// SAP B1 Service Layer client. Owns: cookie jar (B1SESSION + ROUTEID), a
// single-flight (re-)login guard, a 401/"session timeout" -> relogin+retry-once
// path (p-retry), paginated OData reads, and a deterministic Quotation create.
export class SapClient {
  readonly jar = new CookieJar();
  private relogin: Promise<void> | null = null;
  private session: Session | null = null;
  private keepAliveTimer: ReturnType<typeof setInterval> | null = null;
  private readonly dispatcher: Dispatcher;
  private readonly keepAliveMs: number;
  /** Visible for tests — proves the single-flight guard collapses concurrent logins. */
  loginCount = 0;

  constructor(
    readonly baseUrl: string,
    private readonly creds: SapCreds,
    opts: SapClientOptions = {},
  ) {
    this.dispatcher = opts.dispatcher ?? defaultDispatcher();
    this.keepAliveMs = opts.keepAliveMs ?? KEEPALIVE_DEFAULT_MS;
  }

  // POST {baseUrl}/Login -> jar captures B1SESSION + ROUTEID; (re)start keep-alive.
  protected async login(): Promise<void> {
    this.loginCount += 1;
    const url = `${this.baseUrl}/Login`;
    const res = await undiciRequest(url, {
      method: 'POST',
      dispatcher: this.dispatcher,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(this.creds),
    });
    await captureSetCookies(this.jar, url, res.headers['set-cookie']);
    if (res.statusCode >= 400) {
      const body = await res.body.text();
      throw new AppError('sap_login', `SAP Login failed (${res.statusCode}): ${body}`);
    }
    this.session = SessionSchema.parse(await res.body.json());
    this.startKeepAlive();
  }

  // Concurrent callers share ONE in-flight (re-)login; cleared once it settles.
  ensureSession(): Promise<void> {
    return (this.relogin ??= this.login().finally(() => {
      this.relogin = null;
    }));
  }

  /** Lazy: log in only if we have no live session yet. */
  private async ensureLoggedIn(): Promise<void> {
    if (!this.session) await this.ensureSession();
  }

  private startKeepAlive(): void {
    if (this.keepAliveMs <= 0 || this.keepAliveTimer) return;
    this.keepAliveTimer = setInterval(() => {
      // A cheap request refreshes B1SESSION; failures are non-fatal (next real
      // call re-logs in on 401). Never let keep-alive crash the process.
      void this.send('', { method: 'GET' })
        .then((r) => r.body.dump())
        .catch(() => undefined);
    }, this.keepAliveMs);
    this.keepAliveTimer.unref?.();
  }

  /** Release the keep-alive timer + dispatcher (call on app shutdown). */
  async close(): Promise<void> {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = null;
    }
    await this.dispatcher.close?.();
  }

  private url(path: string): string {
    if (/^https?:\/\//.test(path)) return path;
    return `${this.baseUrl}/${path.replace(/^\//, '')}`;
  }

  private async send(path: string, init: { method: string; body?: string }) {
    const url = this.url(path);
    const cookie = await cookieHeader(this.jar, url);
    const res = await undiciRequest(url, {
      method: init.method as 'GET' | 'POST',
      dispatcher: this.dispatcher,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(init.body ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body,
    });
    await captureSetCookies(this.jar, url, res.headers['set-cookie']);
    return res;
  }

  // Core request: ensure a session, send, and on a 401/session-timeout force ONE
  // re-login + retry (p-retry). Other non-2xx are AbortError'd (no retry). The
  // response is validated through the passed Zod schema at the edge.
  async request<T>(path: string, init: { method: string; body?: string }, schema: z.ZodType<T>): Promise<T> {
    await this.ensureLoggedIn();
    return pRetry(
      async () => {
        const res = await this.send(path, init);
        if (res.statusCode === 401) {
          await res.body.dump();
          await this.ensureSession(); // force a fresh login, then p-retry retries
          throw new Error('sap_session_expired');
        }
        if (res.statusCode >= 400) {
          const body = await res.body.text();
          throw new AbortError(new AppError('sap_http', `SAP ${res.statusCode}: ${body}`));
        }
        return schema.parse(await res.body.json());
      },
      { retries: 1, minTimeout: 0, factor: 1 }, // the relogin already happened; retry immediately
    );
  }

  // --- OData reads ---
  private static query({ skip, top, filter }: ListQuery): string {
    // Build OData params literally — URLSearchParams percent-encodes '$', which
    // breaks $skip/$top/$filter. Only the filter VALUE needs URL-encoding.
    const parts: string[] = [];
    if (skip !== undefined) parts.push(`$skip=${skip}`);
    if (top !== undefined) parts.push(`$top=${top}`);
    if (filter) parts.push(`$filter=${encodeURIComponent(filter)}`);
    return parts.length ? `?${parts.join('&')}` : '';
  }

  private async getPage<T extends z.ZodType>(path: string, item: T): Promise<ListPage<z.infer<T>>> {
    const env = await this.request(path, { method: 'GET' }, odataList(item));
    return { items: env.value, nextLink: env['@odata.nextLink'] };
  }

  /** Follow `@odata.nextLink` to materialize every page into one flat array. */
  async getAll<T extends z.ZodType>(path: string, item: T): Promise<Array<z.infer<T>>> {
    const out: Array<z.infer<T>> = [];
    let next: string | undefined = path;
    while (next) {
      const page: ListPage<z.infer<T>> = await this.getPage(next, item);
      out.push(...page.items);
      next = page.nextLink;
    }
    return out;
  }

  getItems(q: ListQuery = {}): Promise<ListPage<SapItem>> {
    return this.getPage(`Items${SapClient.query(q)}`, SapItemSchema);
  }

  getBusinessPartners(q: ListQuery = {}): Promise<ListPage<SapBusinessPartner>> {
    return this.getPage(`BusinessPartners${SapClient.query(q)}`, SapBusinessPartnerSchema);
  }

  getProductTree(treeCode: string): Promise<SapProductTree> {
    // ProductTrees key is the TreeCode (the item code of the produced item).
    return this.request(`ProductTrees('${encodeURIComponent(treeCode)}')`, { method: 'GET' }, SapProductTreeSchema);
  }

  // --- Quotation write (deterministic; HITL-gated upstream per §2.2.2) ---
  async createQuotation(q: SapQuotationCreate): Promise<SapQuotationResult> {
    const body = JSON.stringify(SapQuotationCreateSchema.parse(q)); // edge-validate before any I/O
    return this.request('Quotations', { method: 'POST', body }, SapQuotationResultSchema);
  }
}

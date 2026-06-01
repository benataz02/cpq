import { type Dispatcher } from 'undici';
import { CookieAgent } from 'http-cookie-agent/undici';
import { CookieJar } from 'tough-cookie';
import pRetry, { AbortError } from 'p-retry';
import { z } from 'zod';
import { SapAuthError, classifyHttpError } from './errors.js';
import { ODataListSchema } from './wire.js';

export interface SapCreds { CompanyDB: string; UserName: string; Password: string; }
export const SessionSchema = z.object({ SessionId: z.string(), SessionTimeout: z.number().optional() });
export type Session = z.infer<typeof SessionSchema>;
export interface SapClientOptions { rejectUnauthorized?: boolean; retries?: number; keepAliveFactor?: number; }
export interface RequestInit { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: string; headers?: Record<string, string>; _noAuthGuard?: boolean; }
export interface RawResponse { status: number; headers: Headers; body: unknown; }

export class SapClient {
  readonly jar = new CookieJar();
  private readonly agent: Dispatcher;
  private readonly origin: string;
  private relogin: Promise<void> | null = null;
  private keepAlive: ReturnType<typeof setTimeout> | null = null;
  private session: Session | null = null;
  loginCount = 0;
  constructor(readonly baseUrl: string, private readonly creds: SapCreds, private readonly opts: SapClientOptions = {}, agent?: Dispatcher) {
    this.origin = new URL(baseUrl).origin;
    this.agent = agent ?? (new CookieAgent({ cookies: { jar: this.jar }, connect: { rejectUnauthorized: this.opts.rejectUnauthorized ?? true } }) as unknown as Dispatcher);
  }
  protected async login(): Promise<void> {
    this.loginCount += 1;
    const res = await this.roundTrip('/Login', { method: 'POST', body: JSON.stringify(this.creds), headers: { 'content-type': 'application/json' }, _noAuthGuard: true });
    this.session = SessionSchema.parse(res.body); this.startKeepAlive();
  }
  protected ensureSession(): Promise<void> { return (this.relogin ??= this.login().finally(() => { this.relogin = null; })); }
  private startKeepAlive(): void {
    if (this.keepAlive) clearTimeout(this.keepAlive);
    const ms = Math.max(60_000, (this.session?.SessionTimeout ?? 30) * 60_000 * (this.opts.keepAliveFactor ?? 0.5));
    this.keepAlive = setTimeout(() => { void this.requestRaw('/').catch(() => undefined).finally(() => this.startKeepAlive()); }, ms);
    this.keepAlive.unref();
  }
  /** Main entry: lazy login + single-flight relogin + retry-once on auth/session failure. Returns status+headers+body. */
  async requestRaw(path: string, init: RequestInit = {}): Promise<RawResponse> {
    if (!this.session && !init._noAuthGuard) await this.ensureSession();
    return pRetry(async () => {
      try { return await this.roundTrip(path, init); }
      catch (e) { if (e instanceof SapAuthError && !init._noAuthGuard) { await this.ensureSession(); throw e; } throw new AbortError(e as Error); }
    }, { retries: this.opts.retries ?? 1 });
  }
  async request<T = unknown>(path: string, init: RequestInit = {}): Promise<T> { return (await this.requestRaw(path, init)).body as T; }
  /** One wire round-trip; classified throw on non-2xx; XML→text, JSON→parsed. */
  private async roundTrip(path: string, init: RequestInit): Promise<RawResponse> {
    const u = new URL(`${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`);
    const res = await this.agent.request({ origin: this.origin, path: u.pathname + u.search, method: init.method ?? 'GET',
      headers: { accept: 'application/json', ...init.headers }, body: init.body });
    const ct = String(res.headers['content-type'] ?? '');
    const text = await res.body.text();
    const body: unknown = ct.includes('xml') ? text : (text ? safeJson(text) : null);
    const headers = new Headers(Object.entries(res.headers).map(([k, v]) => [k, String(v)]) as [string, string][]);
    if (res.statusCode >= 400) throw classifyHttpError(res.statusCode, path, body);
    return { status: res.statusCode, headers, body };
  }
  async paginate<T>(firstPath: string, row: z.ZodType<T>, init: RequestInit = {}): Promise<T[]> {
    const out: T[] = []; const env = ODataListSchema(row); let next: string | undefined = firstPath;
    while (next) { const page = env.parse(await this.request(next, init)); out.push(...page.value);
      next = page['@odata.nextLink'] ? `/${page['@odata.nextLink'].replace(/^\//, '')}` : undefined; }
    return out;
  }
  async logout(): Promise<void> { if (this.keepAlive) { clearTimeout(this.keepAlive); this.keepAlive = null; }
    if (this.session) { await this.roundTrip('/Logout', { method: 'POST', _noAuthGuard: true }).catch(() => undefined); this.session = null; } }
  async dispose(): Promise<void> { await this.logout(); const a = this.agent as Dispatcher & { close?: () => Promise<void> }; if (typeof a.close === 'function') await a.close(); }
}
function safeJson(t: string): unknown { try { return JSON.parse(t); } catch { return t; } }

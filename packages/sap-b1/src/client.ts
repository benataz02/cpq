import { CookieJar } from 'tough-cookie';
import { z } from 'zod';

export interface SapCreds {
  CompanyDB: string;
  UserName: string;
  Password: string;
}

// Zod DTO boundary — every Service Layer payload is validated at the edge (P1).
export const SessionSchema = z.object({
  SessionId: z.string(),
  SessionTimeout: z.number().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

// The load-bearing P1 seam: a cookie jar (B1SESSION + ROUTEID) plus single-flight
// re-login. undici + http-cookie-agent transport and p-retry land in P1; the
// re-login concurrency guard is real and tested now.
export class SapClient {
  readonly jar = new CookieJar();
  private relogin: Promise<void> | null = null;
  /** Visible for tests — proves the single-flight guard collapses concurrent logins. */
  loginCount = 0;

  constructor(
    readonly baseUrl: string,
    private readonly creds: SapCreds,
  ) {}

  // POST {baseUrl}/Login -> jar captures B1SESSION + ROUTEID; start the keep-alive timer.
  protected async login(): Promise<void> {
    this.loginCount += 1;
    // Real Service Layer round-trip lands in P1; creds reserved for that wiring.
    void this.creds;
    await Promise.resolve();
  }

  // Concurrent callers share ONE in-flight (re-)login; cleared once it settles.
  ensureSession(): Promise<void> {
    return (this.relogin ??= this.login().finally(() => {
      this.relogin = null;
    }));
  }

  async request(_path: string, _init?: unknown): Promise<unknown> {
    // P1: on 401 / "session timeout" -> await this.ensureSession(); retry once via p-retry.
    return null;
  }
}

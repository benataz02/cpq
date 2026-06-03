import { Agent, type Dispatcher } from 'undici';
import type { CookieJar } from 'tough-cookie';

export type { Dispatcher };

// The dispatcher is the single injection seam: live uses a keep-alive undici
// Agent; tests pass an undici MockAgent. Cookies (B1SESSION + ROUTEID) are
// handled explicitly against the tough-cookie jar so the session/re-login path
// is exercised faithfully by MockAgent — http-cookie-agent's CookieAgent extends
// Agent and cannot compose with MockAgent, which would leave that path untested.
export function defaultDispatcher(): Dispatcher {
  return new Agent({ keepAliveTimeout: 10_000, keepAliveMaxTimeout: 60_000 });
}

/** Cookie header to send for `url`, from the jar (empty string if none). */
export function cookieHeader(jar: CookieJar, url: string): Promise<string> {
  return jar.getCookieString(url);
}

/** Persist any Set-Cookie(s) from a response into the jar (mismatches ignored). */
export async function captureSetCookies(
  jar: CookieJar,
  url: string,
  setCookie: string | string[] | undefined,
): Promise<void> {
  if (!setCookie) return;
  const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const c of cookies) await jar.setCookie(c, url, { ignoreError: true });
}

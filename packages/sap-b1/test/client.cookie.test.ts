import { afterEach, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { type AddressInfo } from 'node:net';
import { SapClient } from '../src/index';

const creds = { CompanyDB: 'X', UserName: 'u', Password: 'p' };

function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

let server: Server | undefined;

afterEach(() => {
  server?.close();
  server = undefined;
});

describe('SapClient cookie capture/re-send (real CookieAgent, loopback)', () => {
  it('captures B1SESSION on /Login and re-sends it on the next request', async () => {
    let secondRequestCookie: string | undefined;

    server = createServer((req, res) => {
      if (req.url?.startsWith('/b1s/v2/Login')) {
        res.setHeader('Set-Cookie', 'B1SESSION=abc123; Path=/');
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ SessionId: 'sess-1', SessionTimeout: 30 }));
        return;
      }
      // any non-login call: record the cookie header it carried
      secondRequestCookie = req.headers.cookie;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ value: [] }));
    });

    const port = await listen(server);
    const origin = `http://127.0.0.1:${port}`;
    const client = new SapClient(`${origin}/b1s/v2`, creds);
    try {
      await client.request('/Items?$top=1');

      const stored = client.jar.getCookiesSync(origin);
      expect(stored.map((c) => c.key)).toContain('B1SESSION');
      expect(secondRequestCookie).toContain('B1SESSION=abc123');
    } finally {
      await client.dispose();
    }
  });
});

import { describe, expect, it } from 'vitest';
import { SapClient, SessionSchema } from '../src/index';

const creds = { CompanyDB: 'X', UserName: 'u', Password: 'p' };

describe('SapClient', () => {
  it('single-flight: concurrent ensureSession() collapse to one login', async () => {
    const c = new SapClient('https://sap.example/b1s/v2', creds);
    await Promise.all([c.ensureSession(), c.ensureSession(), c.ensureSession()]);
    expect(c.loginCount).toBe(1);
  });

  it('re-logins on a fresh call after the in-flight login settles', async () => {
    const c = new SapClient('https://sap.example/b1s/v2', creds);
    await c.ensureSession();
    await c.ensureSession();
    expect(c.loginCount).toBe(2);
  });

  it('validates a session DTO at the boundary', () => {
    expect(SessionSchema.parse({ SessionId: 'abc' }).SessionId).toBe('abc');
    expect(() => SessionSchema.parse({})).toThrow();
  });
});

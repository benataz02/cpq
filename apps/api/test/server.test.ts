import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server';

describe('api server', () => {
  it('builds without error (oRPC RPC+OpenAPI dual-handler wiring constructs)', async () => {
    const app = await buildServer();
    expect(app).toBeDefined();
    await app.close();
  });

  it('GET /healthz -> 200 { ok: true }', async () => {
    const app = await buildServer();
    const res = await app.inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    await app.close();
  });

  it('POST /api/system/ping echoes over the OpenAPI surface (ALS bound via onRequest)', async () => {
    const app = await buildServer();
    const res = await app.inject({
      method: 'POST',
      url: '/api/system/ping',
      headers: { 'content-type': 'application/json' },
      payload: { msg: 'hi' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().pong).toBe('hi');
    await app.close();
  });
});

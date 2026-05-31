import { describe, expect, it } from 'vitest';
import { getContext, runWithContext } from '../src/server';

describe('ALS request context', () => {
  it('isolates concurrent contexts', async () => {
    const read = (id: string) =>
      runWithContext({ tenantId: id, requestId: id }, async () => {
        await new Promise((r) => setTimeout(r, Math.random() * 5));
        return getContext().tenantId;
      });
    const [a, b] = await Promise.all([read('t1'), read('t2')]);
    expect(a).toBe('t1');
    expect(b).toBe('t2');
  });

  it('throws when no context bound', () => {
    expect(() => getContext()).toThrow('context');
  });
});

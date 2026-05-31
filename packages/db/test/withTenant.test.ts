import { describe, expect, it } from 'vitest';
import { runWithContext } from '@cpq/core/server';
import { withTenant } from '../src/withTenant';

describe('withTenant', () => {
  it('throws when no request context is bound', async () => {
    await expect(withTenant(async () => 'unreachable')).rejects.toThrow('context');
  });

  it('reads tenantId from ALS and runs the callback', async () => {
    const result = await runWithContext({ tenantId: 't-1', requestId: 'r-1' }, () =>
      withTenant(async () => 'ok'),
    );
    expect(result).toBe('ok');
  });
});

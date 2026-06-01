import { describe, expect, it } from 'vitest';
import { ConstraintSchema } from '../src/index';

describe('ConstraintSchema range refinement', () => {
  it('rejects a range constraint with neither min nor max (no-op constraint)', () => {
    expect(ConstraintSchema.safeParse({ type: 'range', field: 'x' }).success).toBe(false);
  });

  it('accepts a range constraint with at least one bound', () => {
    expect(ConstraintSchema.safeParse({ type: 'range', field: 'x', min: 1 }).success).toBe(true);
    expect(ConstraintSchema.safeParse({ type: 'range', field: 'x', max: 9 }).success).toBe(true);
  });

  it('still discriminates other constraint types', () => {
    expect(
      ConstraintSchema.safeParse({ type: 'requires', if: { field: 'a', eq: 1 }, then: { field: 'b', in: ['x'] } })
        .success,
    ).toBe(true);
  });
});

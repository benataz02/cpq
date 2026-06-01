import { describe, expect, it } from 'vitest';
import { gower, type FeatureSpec } from '../src/index';

const specs: FeatureSpec[] = [
  { key: 'price', type: 'numeric', range: 100 },
  { key: 'color', type: 'categorical' },
];

describe('gower', () => {
  it('identical rows -> 0', () => {
    expect(gower({ price: 10, color: 'red' }, { price: 10, color: 'red' }, specs)).toBe(0);
  });

  it('fully different -> 1', () => {
    expect(gower({ price: 0, color: 'red' }, { price: 100, color: 'blue' }, specs)).toBe(1);
  });

  it('numeric scaled by range, averaged with an equal categorical', () => {
    // numeric |50-0|/100 = 0.5 ; categorical equal = 0 ; mean = 0.25
    expect(gower({ price: 0, color: 'red' }, { price: 50, color: 'red' }, specs)).toBeCloseTo(0.25);
  });

  it('categorical contributes 0/1', () => {
    // numeric equal = 0 ; categorical differ = 1 ; mean = 0.5
    expect(gower({ price: 10, color: 'red' }, { price: 10, color: 'blue' }, specs)).toBeCloseTo(0.5);
  });

  it('weights bias the mean', () => {
    const w: FeatureSpec[] = [
      { key: 'price', type: 'numeric', range: 100, weight: 3 },
      { key: 'color', type: 'categorical', weight: 1 },
    ];
    // price same (0*3) ; color differ (1*1) ; den 4 -> 0.25
    expect(gower({ price: 10, color: 'red' }, { price: 10, color: 'blue' }, w)).toBeCloseTo(0.25);
  });

  it('stays finite and in [0,1] for non-numeric numeric-field inputs', () => {
    const d = gower({ price: 'abc', color: 'red' }, { price: 10, color: 'red' }, specs);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('clamps to [0,1] even with a non-positive range', () => {
    const bad: FeatureSpec[] = [{ key: 'price', type: 'numeric', range: -100 }];
    const d = gower({ price: 0 }, { price: 50 }, bad);
    expect(d).toBeGreaterThanOrEqual(0);
    expect(d).toBeLessThanOrEqual(1);
  });

  it('throws when the total feature weight is zero (degenerate spec)', () => {
    const zero: FeatureSpec[] = [{ key: 'price', type: 'numeric', weight: 0 }];
    expect(() => gower({ price: 1 }, { price: 2 }, zero)).toThrow(/zero/);
  });
});

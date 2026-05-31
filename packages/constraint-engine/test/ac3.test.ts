import { describe, expect, it } from 'vitest';
import * as fc from 'fast-check';
import { ac3, type BinaryConstraint, type Domain } from '../src/ac3';

describe('ac3', () => {
  it('empty input is consistent', () => {
    const r = ac3({}, []);
    expect(r.consistent).toBe(true);
    expect(r.domains).toEqual({});
  });

  it('narrows the consequent of a requires-style binary predicate', () => {
    // x pinned to {1}; constraint: x===1 implies y===2 -> y narrows to [2]
    const c: BinaryConstraint = { a: 'x', b: 'y', pred: (av, bv) => av !== 1 || bv === 2 };
    const r = ac3({ x: [1], y: [1, 2, 3] }, [c]);
    expect(r.consistent).toBe(true);
    expect(r.domains.y).toEqual([2]);
  });

  it('empties a domain when over-constrained -> inconsistent', () => {
    // pred can only be satisfied by x===2, but x is pinned to {1}
    const c: BinaryConstraint = { a: 'x', b: 'y', pred: (av) => av === 2 };
    const r = ac3({ x: [1], y: [1] }, [c]);
    expect(r.consistent).toBe(false);
    expect(r.domains.x).toEqual([]);
  });

  it('does not over-prune when every value has support', () => {
    // identity allowed-pairs: each value supports itself
    const c: BinaryConstraint = { a: 'x', b: 'y', pred: (av, bv) => av === bv };
    const r = ac3({ x: [1, 2, 3], y: [1, 2, 3] }, [c]);
    expect(r.consistent).toBe(true);
    expect(r.domains.x).toEqual([1, 2, 3]);
    expect(r.domains.y).toEqual([1, 2, 3]);
  });

  it('property: idempotent and never adds values', () => {
    const pool = [0, 1, 2, 3];
    const keyArb = fc.constantFrom('a', 'b', 'c');
    const domainsArb = fc.dictionary(
      keyArb,
      fc.uniqueArray(fc.constantFrom(...pool), { maxLength: 4 }),
      { maxKeys: 3 },
    );
    const pairArb = fc.tuple(fc.constantFrom(...pool), fc.constantFrom(...pool));
    const rawConstraintArb = fc.record({ a: keyArb, b: keyArb, allowed: fc.array(pairArb, { maxLength: 8 }) });

    fc.assert(
      fc.property(domainsArb, fc.array(rawConstraintArb, { maxLength: 4 }), (domains, rawCs) => {
        const cs: BinaryConstraint[] = rawCs
          .filter((c) => c.a !== c.b && domains[c.a] !== undefined && domains[c.b] !== undefined)
          .map((c) => ({
            a: c.a,
            b: c.b,
            pred: (av: Domain[number], bv: Domain[number]) => c.allowed.some(([x, y]) => x === av && y === bv),
          }));

        const first = ac3(domains, cs);

        // never adds: every output value was present in the input domain (unconditional invariant)
        for (const [k, d] of Object.entries(first.domains)) {
          for (const v of d) expect(domains[k]).toContain(v);
        }

        // idempotent ON THE FIXPOINT: when consistent, the queue drained fully and the
        // result is arc-consistent, so a second pass changes nothing. (When inconsistent,
        // AC-3 returns early on the first emptied domain by design, so other domains may
        // still be unpropagated — idempotence is not expected there.)
        if (first.consistent) {
          const second = ac3(first.domains, cs);
          expect(second.domains).toEqual(first.domains);
          expect(second.consistent).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });
});

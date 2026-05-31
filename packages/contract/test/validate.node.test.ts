import { describe, expect, it } from 'vitest';
import { validate, type Framework, type ConfigState } from '../src/index';

function makeFramework(): Framework {
  return {
    schemaVersion: 1,
    key: 'demo',
    fields: [
      { key: 'width', kind: 'number', label: 'Width', min: 10, max: 100, required: true },
      { key: 'material', kind: 'enum', label: 'Material', domain: ['A', 'B'], required: true },
    ],
    constraints: [{ type: 'requires', if: { field: 'width', eq: 100 }, then: { field: 'material', in: ['B'] } }],
    formulas: [{ target: 'area', expr: 'width * 2' }],
    decisionTables: [],
  };
}
const fw: Framework = makeFramework();
const st = (values: Record<string, unknown>): ConfigState => ({ values, derived: {}, provenance: {} });

describe('validate', () => {
  it('passes a valid config', () => {
    const r = validate(fw, st({ width: 50, material: 'A' }));
    expect(r.valid).toBe(true);
  });
  it('flags out-of-range', () => {
    const r = validate(fw, st({ width: 5, material: 'A' }));
    expect(r.issues.some((i) => i.code === 'range')).toBe(true);
  });
  it('flags unknown field', () => {
    const r = validate(fw, st({ width: 50, material: 'A', bogus: 1 }));
    expect(r.issues.some((i) => i.code === 'unknown_field')).toBe(true);
  });
  it('AC-3 narrows material when width=100 (requires)', () => {
    const r = validate(fw, st({ width: 100 }));
    expect(r.narrowedDomains.material).toEqual(['B']);
  });
  it('detects constraint violation (width=100, material=A)', () => {
    const r = validate(fw, st({ width: 100, material: 'A' }));
    expect(r.issues.some((i) => i.code === 'constraint')).toBe(true);
  });
  it('computes a formula', () => {
    const r = validate(fw, st({ width: 50, material: 'A' }));
    expect(r.derived.area).toBe(100);
  });
});

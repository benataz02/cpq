import { describe, expect, it } from 'vitest';
import { validate, type ConfigState, type Framework } from '../src/index';

// SHARED across the `node` and `jsdom` Vitest projects (see vitest.config.ts).
// One file, one validate() import, executed once per environment — this is the
// structural proof that the gate is isomorphic.
const fw: Framework = {
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
const st = (values: Record<string, unknown>): ConfigState => ({ values, derived: {}, provenance: {} });

describe('validate() isomorphism', () => {
  it('valid config -> valid:true', () => {
    expect(validate(fw, st({ width: 50, material: 'A' })).valid).toBe(true);
  });
  it('out-of-range -> code:range', () => {
    expect(validate(fw, st({ width: 5, material: 'A' })).issues.some((i) => i.code === 'range')).toBe(true);
  });
  it('constraint violation -> code:constraint', () => {
    expect(validate(fw, st({ width: 100, material: 'A' })).issues.some((i) => i.code === 'constraint')).toBe(true);
  });
  it('AC-3 narrows material to [B] when width=100', () => {
    expect(validate(fw, st({ width: 100 })).narrowedDomains.material).toEqual(['B']);
  });
  it('formula derives area = width * 2', () => {
    expect(validate(fw, st({ width: 50, material: 'A' })).derived.area).toBe(100);
  });
});

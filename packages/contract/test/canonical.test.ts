import { describe, expect, it } from 'vitest';
import { canonicalize, hashFramework, type Framework } from '../src/index';

const fw: Framework = {
  schemaVersion: 1,
  key: 'demo',
  fields: [{ key: 'width', kind: 'number', label: 'Width', min: 10, max: 100, required: true }],
  constraints: [],
  formulas: [],
  decisionTables: [],
};

describe('canonicalize', () => {
  it('is key-order stable', () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe(canonicalize({ a: 2, b: 1 }));
    expect(canonicalize({ a: 2, b: 1 })).toBe('{"a":2,"b":1}');
  });
  it('recurses into nested objects and arrays', () => {
    expect(canonicalize({ z: [{ y: 1, x: 2 }] })).toBe('{"z":[{"x":2,"y":1}]}');
  });
});

describe('hashFramework', () => {
  it('returns 64 lowercase hex chars', async () => {
    const h = await hashFramework(fw);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
  it('is deterministic regardless of key order', async () => {
    const reordered = {
      decisionTables: [],
      formulas: [],
      constraints: [],
      fields: fw.fields,
      key: 'demo',
      schemaVersion: 1,
    } as Framework;
    expect(await hashFramework(fw)).toBe(await hashFramework(reordered));
  });
});

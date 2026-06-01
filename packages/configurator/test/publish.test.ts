import { describe, expect, it } from 'vitest';
import { configure, publish } from '../src/index';

const fwInput = {
  schemaVersion: 1,
  key: 'demo',
  fields: [{ key: 'width', kind: 'number', label: 'Width', min: 10, max: 100, required: true }],
  constraints: [],
  formulas: [{ target: 'area', expr: 'width * 2' }],
  decisionTables: [],
};

describe('configurator', () => {
  it('publish parses + content-hashes the framework', async () => {
    const { hash, framework } = await publish(fwInput);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(framework.key).toBe('demo');
  });

  it('publish rejects structurally invalid input', async () => {
    await expect(publish({ schemaVersion: 2 })).rejects.toThrow();
  });

  it('configure runs the same validate() gate', () => {
    const r = configure(fwInput as never, { values: { width: 50 }, derived: {}, provenance: {} });
    expect(r.valid).toBe(true);
    expect(r.derived.area).toBe(100);
  });
});

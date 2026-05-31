// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { validate, type ConfigState, type Framework } from '../src/index';

// Explicitly demonstrates that the gate runs inside a browser-like environment:
// `window`/`document` exist (jsdom), and the SAME validate() narrows domains.
describe('validate() in a browser-like (jsdom) environment', () => {
  it('really is running under jsdom', () => {
    expect(typeof window).toBe('object');
    expect(typeof document).toBe('object');
  });

  it('the identical gate narrows enum domains in the browser env', () => {
    const fw: Framework = {
      schemaVersion: 1,
      key: 'demo',
      fields: [
        { key: 'width', kind: 'number', label: 'Width', min: 10, max: 100, required: true },
        { key: 'material', kind: 'enum', label: 'Material', domain: ['A', 'B'], required: true },
      ],
      constraints: [{ type: 'requires', if: { field: 'width', eq: 100 }, then: { field: 'material', in: ['B'] } }],
      formulas: [],
      decisionTables: [],
    };
    const state: ConfigState = { values: { width: 100 }, derived: {}, provenance: {} };
    expect(validate(fw, state).narrowedDomains.material).toEqual(['B']);
  });
});

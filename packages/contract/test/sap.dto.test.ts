import { describe, expect, it } from 'vitest';
import { EntityKey, EntityRecord } from '../src/index';

// SHARED across the `node` and `jsdom` Vitest projects (see vitest.config.ts):
// the generic SAP DTOs are browser-safe (zod-only), so they must parse
// identically in Node and in a browser-like environment — the package
// isomorphism proof extends to the `sap.*` surface.
describe('generic SAP DTOs', () => {
  it('EntityKey parses a string key', () => {
    expect(EntityKey.parse('c1')).toBe('c1');
  });
  it('EntityKey parses a numeric key', () => {
    expect(EntityKey.parse(22)).toBe(22);
  });
  it('EntityKey parses a composite key record', () => {
    expect(EntityKey.parse({ Code: 'AK', Type: -3 })).toEqual({ Code: 'AK', Type: -3 });
  });
  it('EntityRecord round-trips an opaque record', () => {
    const rec = { ItemCode: 'A0001', Frozen: false, Price: 12.5, Extra: { nested: true } };
    expect(EntityRecord.parse(rec)).toEqual(rec);
  });
});

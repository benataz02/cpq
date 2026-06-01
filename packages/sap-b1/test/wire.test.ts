import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ODataListSchema } from '../src/wire';

describe('ODataListSchema', () => {
  const RowSchema = z.record(z.string(), z.unknown());

  it('parses an envelope with a value array and an @odata.nextLink', () => {
    const parsed = ODataListSchema(RowSchema).parse({
      value: [{ a: 1 }],
      '@odata.nextLink': 'X?$skip=20',
    });
    expect(parsed.value).toEqual([{ a: 1 }]);
    expect(parsed['@odata.nextLink']).toBe('X?$skip=20');
  });

  it('treats @odata.nextLink as optional', () => {
    const parsed = ODataListSchema(RowSchema).parse({ value: [{ a: 1 }] });
    expect(parsed.value).toEqual([{ a: 1 }]);
    expect(parsed['@odata.nextLink']).toBeUndefined();
  });

  it('accepts an optional @odata.count', () => {
    const parsed = ODataListSchema(RowSchema).parse({ value: [], '@odata.count': 42 });
    expect(parsed['@odata.count']).toBe(42);
  });

  it('rejects an envelope missing the value array', () => {
    expect(() => ODataListSchema(RowSchema).parse({})).toThrow();
  });
});

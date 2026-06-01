import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEdmx } from '../src/metadata/edmx';
import { describeEntity } from '../src/metadata/describe';

const xml = readFileSync(new URL('./fixtures/metadata.edmx.xml', import.meta.url), 'utf8');
const meta = parseEdmx(xml);

describe('describeEntity', () => {
  it('maps a String property with MaxLength to a bounded string', () => {
    const d = describeEntity(meta, 'BusinessPartners');
    expect(d.jsonSchema.properties.CardName).toEqual({ type: 'string', maxLength: 100 });
  });

  it('lists non-nullable non-key props as required, excluding keys', () => {
    const d = describeEntity(meta, 'BusinessPartners');
    expect(d.jsonSchema.required).toContain('CardName');
    expect(d.jsonSchema.required).not.toContain('CardCode'); // CardCode is the key → excluded
  });

  it('maps an enum property to a string enum with x-enumValues', () => {
    const d = describeEntity(meta, 'BusinessPartners');
    expect(d.jsonSchema.properties.CardType).toEqual({
      type: 'string',
      enum: ['cCustomer', 'cSupplier'],
      'x-enumValues': [
        { name: 'cCustomer', value: 'C' },
        { name: 'cSupplier', value: 'S' },
      ],
    });
  });

  it('maps numeric and datetime EDM types', () => {
    const d = describeEntity(meta, 'Quotations');
    expect(d.jsonSchema.properties.DocTotal).toEqual({ type: 'number' });
    expect(d.jsonSchema.properties.DocEntry).toEqual({ type: 'integer' });
    expect(d.jsonSchema.properties.DocDate).toEqual({ type: 'string', format: 'date-time' });
  });

  it('maps a collection navigation property to an array of the child schema', () => {
    const d = describeEntity(meta, 'Quotations');
    const lines = d.jsonSchema.properties.DocumentLines;
    expect(lines.type).toBe('array');
    expect(lines.items).toBeTypeOf('object');
    expect(lines.items.type).toBe('object');
    expect(lines.items.properties.Quantity).toEqual({ type: 'number' });
  });

  it('declares draft 2020-12 with additionalProperties:true for UDFs', () => {
    const d = describeEntity(meta, 'BusinessPartners');
    expect(d.jsonSchema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(d.jsonSchema.type).toBe('object');
    expect(d.jsonSchema.additionalProperties).toBe(true);
  });

  it('surfaces keys, enums, and bound actions on the result', () => {
    const d = describeEntity(meta, 'Quotations');
    expect(d.entitySet).toBe('Quotations');
    expect(d.keys).toEqual([{ name: 'DocEntry', edmType: 'Int32' }]);
    expect(d.hasActions).toBe(true);
    expect(d.actions).toContain('Cancel');

    const bp = describeEntity(meta, 'BusinessPartners');
    expect(bp.hasActions).toBe(false);
    expect(bp.enums.BoCardTypes).toEqual([
      { name: 'cCustomer', value: 'C' },
      { name: 'cSupplier', value: 'S' },
    ]);
  });

  it('throws on an unknown entity set', () => {
    expect(() => describeEntity(meta, 'Nope')).toThrow();
  });
});

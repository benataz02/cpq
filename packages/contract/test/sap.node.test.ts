import { describe, expect, it } from 'vitest';
import {
  SapItemSchema,
  SapQuotationCreateSchema,
  SapQuotationResultSchema,
  odataList,
} from '../src/index';

describe('SAP DTO schemas', () => {
  it('validates the fields we use and passes unknown server fields through', () => {
    const parsed = SapItemSchema.parse({ ItemCode: 'CFG-1', ItemName: 'Bracket', U_Whatever: 42 });
    expect(parsed.ItemCode).toBe('CFG-1');
    expect((parsed as Record<string, unknown>).U_Whatever).toBe(42); // loose: not stripped
  });

  it('rejects an item with no ItemCode at the boundary', () => {
    expect(SapItemSchema.safeParse({ ItemName: 'no code' }).success).toBe(false);
  });

  it('requires at least one quotation line', () => {
    expect(SapQuotationCreateSchema.safeParse({ CardCode: 'C1', DocumentLines: [] }).success).toBe(false);
    expect(
      SapQuotationCreateSchema.safeParse({ CardCode: 'C1', DocumentLines: [{ ItemCode: 'X', Quantity: 1 }] }).success,
    ).toBe(true);
  });

  it('parses an OData collection envelope with a nextLink', () => {
    const env = odataList(SapItemSchema).parse({
      value: [{ ItemCode: 'A' }, { ItemCode: 'B' }],
      '@odata.nextLink': 'Items?$skip=2',
    });
    expect(env.value).toHaveLength(2);
    expect(env['@odata.nextLink']).toBe('Items?$skip=2');
  });

  it('reads a Quotation result identity', () => {
    expect(SapQuotationResultSchema.parse({ DocEntry: 17, DocNum: 1042 }).DocEntry).toBe(17);
  });
});

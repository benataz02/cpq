import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEdmx } from '../src/metadata/edmx';
import { validateEntityPayload } from '../src/metadata/validate';

const xml = readFileSync(new URL('./fixtures/metadata.edmx.xml', import.meta.url), 'utf8');
const meta = parseEdmx(xml);

describe('validateEntityPayload', () => {
  it('flags a missing non-nullable property on create as required', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'create', { CardCode: 'C0001' });
    const required = issues.find((i) => i.path === 'CardName' && i.code === 'required');
    expect(required).toBeDefined();
  });

  it('flags a String that exceeds MaxLength as maxLength', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'create', {
      CardCode: 'C0001',
      CardName: 'x'.repeat(101),
    });
    const tooLong = issues.find((i) => i.path === 'CardName' && i.code === 'maxLength');
    expect(tooLong).toBeDefined();
  });

  it('flags a value outside an enum as enum', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'create', {
      CardCode: 'C0001',
      CardName: 'Acme',
      CardType: 'cBogus',
    });
    const bad = issues.find((i) => i.path === 'CardType' && i.code === 'enum');
    expect(bad).toBeDefined();
  });

  it('returns [] for a valid create', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'create', {
      CardCode: 'C0001',
      CardName: 'Acme',
      CardType: 'cCustomer',
    });
    expect(issues).toEqual([]);
  });

  it('accepts a partial update (no required-on-create)', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'update', { CardName: 'Renamed' });
    expect(issues).toEqual([]);
  });

  it('validates collection navigation rows recursively', () => {
    const issues = validateEntityPayload(meta, 'Quotations', 'create', {
      CardCode: 'C0001',
      DocumentLines: [{ LineNum: 0, Quantity: 5 }],
    });
    expect(issues).toEqual([]);
  });

  it('flags a bad scalar inside a collection navigation row', () => {
    const issues = validateEntityPayload(meta, 'Quotations', 'create', {
      CardCode: 'C0001',
      DocumentLines: [{ LineNum: 0, Quantity: 'lots' }],
    });
    const bad = issues.find((i) => i.path === 'DocumentLines[0].Quantity' && i.code === 'type');
    expect(bad).toBeDefined();
  });

  it('allows U_* user-defined fields and @odata.* annotations', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'update', {
      U_CustomField: 'anything',
      '@odata.etag': 'W/"abc"',
    });
    expect(issues).toEqual([]);
  });

  it('flags an unmodeled property as unknown_property', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'update', { NotAField: 1 });
    const unknown = issues.find((i) => i.path === 'NotAField' && i.code === 'unknown_property');
    expect(unknown).toBeDefined();
  });

  it('allows null/undefined scalars (PATCH clears a field)', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'update', { CardName: null });
    expect(issues).toEqual([]);
  });

  it('accepts an enum member value as well as its name', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'update', { CardType: 'C' });
    expect(issues).toEqual([]);
  });

  it('returns a single type issue for an unknown entity set', () => {
    const issues = validateEntityPayload(meta, 'Nope', 'create', {});
    expect(issues).toEqual([{ path: '', code: 'type', message: expect.any(String) }]);
  });

  it('returns a single type issue for a non-object payload', () => {
    const issues = validateEntityPayload(meta, 'BusinessPartners', 'create', 42 as unknown as Record<string, unknown>);
    expect(issues).toEqual([{ path: '', code: 'type', message: expect.any(String) }]);
  });
});

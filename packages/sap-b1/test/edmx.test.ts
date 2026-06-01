import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEdmx } from '../src/metadata/edmx';

const xml = readFileSync(new URL('./fixtures/metadata.edmx.xml', import.meta.url), 'utf8');
const meta = parseEdmx(xml);

describe('parseEdmx', () => {
  it('discovers every EntitySet in the container', () => {
    expect(meta.entitySets.size).toBe(5);
    expect([...meta.entitySets.keys()].sort()).toEqual([
      'BusinessPartners',
      'DocumentLines',
      'ItemPrices',
      'Quotations',
      'Singletons',
    ]);
  });

  it('resolves a single string key with its EDM type', () => {
    const bp = meta.entitySets.get('BusinessPartners');
    expect(bp?.keys).toEqual([{ name: 'CardCode', edmType: 'String' }]);
  });

  it('resolves an int key on Quotations', () => {
    const q = meta.entitySets.get('Quotations');
    expect(q?.keys).toEqual([{ name: 'DocEntry', edmType: 'Int32' }]);
  });

  it('resolves a composite key set', () => {
    const ip = meta.entitySets.get('ItemPrices');
    expect(ip?.keys).toEqual([
      { name: 'ItemCode', edmType: 'String' },
      { name: 'PriceList', edmType: 'Int32' },
    ]);
  });

  it('attaches bound Actions to the bound EntityType', () => {
    const q = meta.entitySets.get('Quotations');
    expect(q?.actions).toContain('Cancel');
  });

  it('marks a collection navigation property as collection:true', () => {
    const q = meta.entitySets.get('Quotations');
    const nav = q?.navProps.find((n) => n.name === 'DocumentLines');
    expect(nav).toEqual({ name: 'DocumentLines', target: 'DocumentLine', collection: true });
  });

  it('resolves enum members', () => {
    expect(meta.enums.get('BoCardTypes')).toEqual([
      { name: 'cCustomer', value: 'C' },
      { name: 'cSupplier', value: 'S' },
    ]);
    expect(meta.enums.get('BoYesNoEnum')).toEqual([
      { name: 'tYES', value: '-3' },
      { name: 'tNO', value: '-2' },
    ]);
  });

  it('maps an enum-typed property to edmType Enum with its enumType', () => {
    const bp = meta.entitySets.get('BusinessPartners');
    const cardType = bp?.properties.find((p) => p.name === 'CardType');
    expect(cardType?.edmType).toBe('Enum');
    expect(cardType?.enumType).toBe('BoCardTypes');
  });

  it('keeps MaxLength as a positive integer', () => {
    const bp = meta.entitySets.get('BusinessPartners');
    expect(bp?.properties.find((p) => p.name === 'CardName')?.maxLength).toBe(100);
    expect(bp?.properties.find((p) => p.name === 'CardCode')?.maxLength).toBe(15);
  });

  it('defaults Nullable to true when the attribute is absent', () => {
    const bp = meta.entitySets.get('BusinessPartners');
    expect(bp?.properties.find((p) => p.name === 'CardType')?.nullable).toBe(true);
    expect(bp?.properties.find((p) => p.name === 'CardCode')?.nullable).toBe(false);
  });

  it('flags key properties with isKey', () => {
    const bp = meta.entitySets.get('BusinessPartners');
    expect(bp?.properties.find((p) => p.name === 'CardCode')?.isKey).toBe(true);
    expect(bp?.properties.find((p) => p.name === 'CardName')?.isKey).toBe(false);
  });

  it('parses a single-Property element as an array (isArray footgun)', () => {
    const s = meta.entitySets.get('Singletons');
    expect(s?.properties).toHaveLength(1);
    expect(s?.properties[0]).toMatchObject({ name: 'OnlyField', edmType: 'String', isKey: true });
  });
});

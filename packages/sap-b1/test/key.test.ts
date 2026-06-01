import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEdmx } from '../src/metadata/edmx';
import { formatEntityKey } from '../src/metadata/key';

const xml = readFileSync(new URL('./fixtures/metadata.edmx.xml', import.meta.url), 'utf8');
const meta = parseEdmx(xml);

function set(name: string) {
  const es = meta.entitySets.get(name);
  if (!es) throw new Error(`fixture missing entity set ${name}`);
  return es;
}

describe('formatEntityKey', () => {
  it('quotes a single string key', () => {
    expect(formatEntityKey(set('BusinessPartners'), 'C0001')).toBe("('C0001')");
  });

  it("escapes a single quote in a string key by doubling it", () => {
    expect(formatEntityKey(set('BusinessPartners'), "O'Brien")).toBe("('O''Brien')");
  });

  it('renders a numeric key bare (unquoted)', () => {
    expect(formatEntityKey(set('Quotations'), 22)).toBe('(22)');
  });

  it('renders a composite key in entity-set key order, quoting per EDM type', () => {
    expect(formatEntityKey(set('ItemPrices'), { ItemCode: 'X', PriceList: 1 })).toBe(
      "(ItemCode='X',PriceList=1)",
    );
  });

  it('throws when a composite-key part is missing', () => {
    expect(() => formatEntityKey(set('ItemPrices'), { ItemCode: 'X' })).toThrow();
  });

  it('throws when a composite key is given a non-object scalar', () => {
    expect(() => formatEntityKey(set('ItemPrices'), 'X')).toThrow();
  });
});

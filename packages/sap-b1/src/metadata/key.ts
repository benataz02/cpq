import type { EdmType, SapEntitySet } from './model.js';

/** A key value: a single scalar (one-part key) or a `{ name: value }` map (composite key). */
export type EntityKeyInput = string | number | Record<string, string | number>;

/** EDM types whose OData literal is single-quoted (everything that isn't numeric/boolean). */
const STRINGISH: ReadonlySet<EdmType> = new Set<EdmType>([
  'String',
  'Guid',
  'DateTimeOffset',
  'Date',
  'Time',
  'Enum',
]);

/**
 * Render one key value as an OData literal: stringish EDM types are single-quoted with embedded
 * `'` doubled (`'` → `''`); numeric types are emitted bare.
 */
function quote(edmType: EdmType, value: string | number): string {
  if (STRINGISH.has(edmType)) {
    return `'${String(value).replace(/'/g, "''")}'`;
  }
  return String(value);
}

/**
 * Build the OData key segment for an entity, e.g. `('C0001')`, `(22)`, or `(ItemCode='X',PriceList=1)`.
 * A single scalar formats against the set's sole key; an object formats each part in `es.keys` order,
 * throwing on a missing part. A scalar passed to a composite-keyed set also throws.
 */
export function formatEntityKey(es: SapEntitySet, key: EntityKeyInput): string {
  const keys = es.keys;
  if (typeof key === 'string' || typeof key === 'number') {
    if (keys.length !== 1) {
      throw new Error(
        `${es.name} has a composite key (${keys.map((k) => k.name).join(',')}); pass an object`,
      );
    }
    return `(${quote(keys[0]!.edmType, key)})`;
  }
  if (typeof key !== 'object' || key === null) {
    throw new Error(`${es.name}: key must be a string, number, or object`);
  }
  const parts = keys.map((k) => {
    const part = key[k.name];
    if (part === undefined) {
      throw new Error(`${es.name}: missing key part '${k.name}'`);
    }
    return `${k.name}=${quote(k.edmType, part)}`;
  });
  return `(${parts.join(',')})`;
}

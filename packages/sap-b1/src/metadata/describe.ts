import type { SapEntitySet, SapEnumMember, SapKeyRef, SapMetadata, SapProperty } from './model.js';

/** A JSON Schema (draft 2020-12) property node. Loose `Record` so x-* vendor keys live alongside core. */
export type JsonProp = Record<string, unknown>;

/** A JSON Schema (draft 2020-12) object node for one entity set. */
export interface EntityJsonSchema {
  $schema: 'https://json-schema.org/draft/2020-12/schema';
  type: 'object';
  properties: Record<string, JsonProp>;
  required: string[];
  additionalProperties: true; // SAP B1 UDFs (U_*) and @odata.* are always permitted.
}

export interface DescribeResult {
  entitySet: string;
  keys: SapKeyRef[];
  jsonSchema: EntityJsonSchema;
  enums: Record<string, SapEnumMember[]>;
  hasActions: boolean;
  actions: string[];
}

/** Map one EDM-typed property to a JSON Schema property node. */
function edmToJsonProp(p: SapProperty, enums: Map<string, SapEnumMember[]>): JsonProp {
  switch (p.edmType) {
    case 'String': {
      const node: JsonProp = { type: 'string' };
      if (p.maxLength !== undefined) node.maxLength = p.maxLength;
      return node;
    }
    case 'Int32':
    case 'Int64':
      return { type: 'integer' };
    case 'Double':
    case 'Decimal':
      return { type: 'number' };
    case 'Boolean':
      return { type: 'boolean' };
    case 'DateTimeOffset':
      return { type: 'string', format: 'date-time' };
    case 'Date':
      return { type: 'string', format: 'date' };
    case 'Time':
      return { type: 'string', format: 'time' };
    case 'Guid':
      return { type: 'string', format: 'uuid' };
    case 'Enum': {
      const members = (p.enumType && enums.get(p.enumType)) || [];
      return { type: 'string', enum: members.map((m) => m.name), 'x-enumValues': members };
    }
    default:
      return {}; // unknown EDM type → an open node.
  }
}

/**
 * Emit a JSON Schema (draft 2020-12) describing one entity set — the shape the P2 builder/UI consumes
 * (deliberately rhyming with `frameworkJsonSchema()`). Collection navigation properties expand to an
 * array of the child entity's schema, guarded to **depth 1** (`depth`) so self/mutual references stop.
 */
export function describeEntity(meta: SapMetadata, entitySet: string, depth = 0): DescribeResult {
  const es: SapEntitySet | undefined = meta.entitySets.get(entitySet);
  if (!es) throw new Error(`Unknown entity set: ${entitySet}`);

  const properties: Record<string, JsonProp> = {};
  for (const p of es.properties) properties[p.name] = edmToJsonProp(p, meta.enums);

  // Expand collection navigation properties only one level deep (depth-1 guard).
  if (depth < 1) {
    for (const nav of es.navProps) {
      if (!nav.collection) continue;
      const childSet = [...meta.entitySets.values()].find((c) => c.entityType === nav.target);
      if (!childSet) continue;
      properties[nav.name] = { type: 'array', items: describeEntity(meta, childSet.name, depth + 1).jsonSchema };
    }
  }

  // required = non-nullable, non-key scalar props (keys are server-assigned / path-bound, never required in a body).
  const required = es.properties.filter((p) => !p.nullable && !p.isKey).map((p) => p.name);

  const enums: Record<string, SapEnumMember[]> = {};
  for (const [name, members] of meta.enums) enums[name] = members;

  return {
    entitySet: es.name,
    keys: es.keys,
    jsonSchema: {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties,
      required,
      additionalProperties: true,
    },
    enums,
    hasActions: es.actions.length > 0,
    actions: es.actions,
  };
}

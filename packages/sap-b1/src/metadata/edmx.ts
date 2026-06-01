import { XMLParser } from 'fast-xml-parser';
import { EntitySetSchema, EnumMemberSchema, type EdmType, type SapEntitySet, type SapMetadata, type SapEnumMember, type SapKeyRef, type SapNavProperty, type SapProperty } from './model.js';

// @_ attribute prefix; removeNSPrefix collapses 'edmx:'/namespaces; parseAttributeValue:false keeps '-3' a string;
// isArray forces single-child elements into arrays so the walker is uniform (the classic fast-xml-parser footgun).
const parser = new XMLParser({
  ignoreAttributes: false, attributeNamePrefix: '@_', parseAttributeValue: false, removeNSPrefix: true,
  isArray: (n) => ['Schema','EntityType','EntitySet','EnumType','Action','Property','NavigationProperty','PropertyRef','Member','Parameter'].includes(n),
});
const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
function bareType(raw: string): { name: string; collection: boolean } {
  const collection = raw.startsWith('Collection('); const inner = collection ? raw.slice('Collection('.length, -1) : raw;
  return { name: inner.split('.').pop() ?? inner, collection };
}
function mapEdmType(raw: string, enumNames: Set<string>): { edmType: EdmType; enumType?: string } {
  if (raw.startsWith('Edm.')) { const t = raw.slice(4); const known = ['String','Int32','Int64','Double','Decimal','DateTimeOffset','Date','Time','Boolean','Guid']; return { edmType: (known.includes(t) ? t : 'unknown') as EdmType }; }
  const { name } = bareType(raw); return enumNames.has(name) ? { edmType: 'Enum', enumType: name } : { edmType: 'unknown' };
}
export function parseEdmx(xml: string): SapMetadata {
  const doc = parser.parse(xml);
  const schemas = asArray(doc?.Edmx?.DataServices?.Schema);
  // Pass 1: EnumTypes (need names before mapping property types).
  const enums = new Map<string, SapEnumMember[]>(); const enumNames = new Set<string>();
  for (const schema of schemas) for (const et of asArray(schema.EnumType)) {
    const name: string = et['@_Name']; enumNames.add(name);
    enums.set(name, asArray(et.Member).map((m: Record<string,string>) => EnumMemberSchema.parse({ name: m['@_Name'], value: String(m['@_Value'] ?? m['@_Name']) })));
  }
  // Pass 2: EntityTypes (keys + properties + nav props).
  interface RawET { keyNames: string[]; properties: Omit<SapProperty,'isKey'>[]; navProps: SapNavProperty[]; }
  const entityTypes = new Map<string, RawET>();
  for (const schema of schemas) for (const et of asArray(schema.EntityType)) {
    const keyNames = asArray(et.Key?.PropertyRef).map((r: Record<string,string>) => r['@_Name']);
    const properties = asArray(et.Property).map((p: Record<string,string>) => {
      const { edmType, enumType } = mapEdmType(p['@_Type'], enumNames); const ml = p['@_MaxLength'];
      return { name: p['@_Name'], edmType, enumType, nullable: p['@_Nullable'] !== 'false', maxLength: ml && ml !== 'max' ? Number(ml) : undefined };
    });
    const navProps: SapNavProperty[] = asArray(et.NavigationProperty).map((n: Record<string,string>) => { const { name, collection } = bareType(n['@_Type']); return { name: n['@_Name'], target: name, collection }; });
    entityTypes.set(et['@_Name'], { keyNames, properties, navProps });
  }
  // Pass 3: bound Actions, grouped by the first Parameter's bound EntityType (v4 IsBound).
  const actionsByType = new Map<string, string[]>();
  for (const schema of schemas) for (const a of asArray(schema.Action)) {
    if (a['@_IsBound'] !== 'true') continue; const binding = asArray(a.Parameter)[0]; if (!binding) continue;
    const { name: boundType } = bareType(binding['@_Type']); const list = actionsByType.get(boundType) ?? []; list.push(a['@_Name']); actionsByType.set(boundType, list);
  }
  // Pass 4: EntityContainer → EntitySet → resolve everything.
  const entitySets = new Map<string, SapEntitySet>();
  for (const schema of schemas) {
    const container = schema.EntityContainer; if (!container) continue;
    for (const es of asArray(container.EntitySet)) {
      const setName: string = es['@_Name']; const { name: typeName } = bareType(es['@_EntityType']);
      const et = entityTypes.get(typeName); if (!et) continue;                       // dangling ref → skip
      const keySet = new Set(et.keyNames);
      const properties: SapProperty[] = et.properties.map((p) => ({ ...p, isKey: keySet.has(p.name) }));
      const keys: SapKeyRef[] = et.keyNames.map((kn) => ({ name: kn, edmType: properties.find((p) => p.name === kn)?.edmType ?? 'String' }));
      entitySets.set(setName, EntitySetSchema.parse({ name: setName, entityType: typeName, keys, properties, navProps: et.navProps, actions: actionsByType.get(typeName) ?? [] }));
    }
  }
  return { entitySets, enums, fetchedAt: Date.now() };
}

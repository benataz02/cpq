import type { SapEntitySet, SapEnumMember, SapMetadata, SapProperty } from './model.js';

/** A single validation failure. `path` is dotted/bracketed (e.g. `DocumentLines[0].Quantity`; `''` = root). */
export interface EntityIssue {
  path: string;
  code: 'required' | 'type' | 'maxLength' | 'enum' | 'unknown_property';
  message: string;
}

/** Write mode: `create` enforces required-on-create; `update` (PATCH) is partial — only present fields are checked. */
export type EntityMode = 'create' | 'update';

/** A property's value is `null`/`undefined`? PATCH clears a field by sending null — always permitted, never type-checked. */
function isNullish(v: unknown): boolean {
  return v === null || v === undefined;
}

/** Validate one scalar value against its EDM-typed property, pushing any issue under `path`. */
function checkScalar(
  prop: SapProperty,
  value: unknown,
  path: string,
  enums: Map<string, SapEnumMember[]>,
  issues: EntityIssue[],
): void {
  if (isNullish(value)) return; // null/undefined allowed — PATCH clears.
  switch (prop.edmType) {
    case 'String': {
      if (typeof value !== 'string') {
        issues.push({ path, code: 'type', message: `${path}: expected string` });
        return;
      }
      if (prop.maxLength !== undefined && value.length > prop.maxLength) {
        issues.push({ path, code: 'maxLength', message: `${path}: exceeds maxLength ${prop.maxLength}` });
      }
      return;
    }
    case 'Int32':
    case 'Int64':
      if (typeof value !== 'number' || !Number.isInteger(value)) {
        issues.push({ path, code: 'type', message: `${path}: expected integer` });
      }
      return;
    case 'Double':
    case 'Decimal':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        issues.push({ path, code: 'type', message: `${path}: expected number` });
      }
      return;
    case 'Boolean':
      if (typeof value !== 'boolean') {
        issues.push({ path, code: 'type', message: `${path}: expected boolean` });
      }
      return;
    case 'DateTimeOffset':
    case 'Date':
    case 'Time':
    case 'Guid':
      if (typeof value !== 'string') {
        issues.push({ path, code: 'type', message: `${path}: expected string` });
      }
      return;
    case 'Enum': {
      const members = (prop.enumType && enums.get(prop.enumType)) || [];
      const ok = members.some((m) => m.name === value || m.value === value);
      if (!ok) {
        issues.push({ path, code: 'enum', message: `${path}: not a member of ${prop.enumType ?? 'enum'}` });
      }
      return;
    }
    default:
      return; // unknown EDM type → open; nothing to enforce.
  }
}

/** A user-defined field (`U_*`) or an OData annotation (`@odata.*` / any `@`-prefixed key) — always allowed. */
function isAllowedExtra(key: string): boolean {
  return key.startsWith('U_') || key.startsWith('@odata') || key.startsWith('@');
}

/** Resolve the child entity set behind a collection navigation property (its `target` is the entity *type* name). */
function childSetForNav(meta: SapMetadata, targetType: string): SapEntitySet | undefined {
  for (const es of meta.entitySets.values()) if (es.entityType === targetType) return es;
  return undefined;
}

/** Validate `payload` against `es` in `mode`, accumulating issues under `prefix` (used to address nested rows). */
function validateObject(
  meta: SapMetadata,
  es: SapEntitySet,
  mode: EntityMode,
  payload: Record<string, unknown>,
  prefix: string,
  issues: EntityIssue[],
): void {
  const propByName = new Map<string, SapProperty>();
  for (const p of es.properties) propByName.set(p.name, p);
  const navByName = new Map(es.navProps.map((n) => [n.name, n] as const));

  // Required-on-create: every non-nullable, non-key property absent from the body.
  if (mode === 'create') {
    for (const p of es.properties) {
      if (!p.nullable && !p.isKey && !(p.name in payload)) {
        const path = prefix ? `${prefix}.${p.name}` : p.name;
        issues.push({ path, code: 'required', message: `${path}: required` });
      }
    }
  }

  for (const [key, value] of Object.entries(payload)) {
    const path = prefix ? `${prefix}.${key}` : key;
    const prop = propByName.get(key);
    if (prop) {
      checkScalar(prop, value, path, meta.enums, issues);
      continue;
    }
    const nav = navByName.get(key);
    if (nav && nav.collection) {
      const childSet = childSetForNav(meta, nav.target);
      if (!childSet) continue; // dangling nav target → nothing to validate against.
      if (!Array.isArray(value)) {
        issues.push({ path, code: 'type', message: `${path}: expected array` });
        continue;
      }
      value.forEach((row, i) => {
        const rowPath = `${path}[${i}]`;
        if (typeof row !== 'object' || row === null || Array.isArray(row)) {
          issues.push({ path: rowPath, code: 'type', message: `${rowPath}: expected object` });
          return;
        }
        // Nested rows are validated with update-leniency (no required-on-create on sub-lines).
        validateObject(meta, childSet, 'update', row as Record<string, unknown>, rowPath, issues);
      });
      continue;
    }
    if (isAllowedExtra(key)) continue; // U_* UDFs and @odata.* annotations are always permitted.
    issues.push({ path, code: 'unknown_property', message: `${path}: unknown property` });
  }
}

/**
 * Strict, metadata-derived payload validator — the single write-side gate before a Service Layer
 * POST/PATCH. Hand-rolled (not dynamic Zod): O(payload fields), a clean `create`/`update` branch, and the
 * exact issue vocabulary `describeEntity` already implies (one source of truth).
 */
export function validateEntityPayload(
  meta: SapMetadata,
  entitySet: string,
  mode: EntityMode,
  payload: Record<string, unknown>,
): EntityIssue[] {
  const es = meta.entitySets.get(entitySet);
  if (!es) return [{ path: '', code: 'type', message: `Unknown entity set: ${entitySet}` }];
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return [{ path: '', code: 'type', message: 'Payload must be an object' }];
  }
  const issues: EntityIssue[] = [];
  validateObject(meta, es, mode, payload, '', issues);
  return issues;
}

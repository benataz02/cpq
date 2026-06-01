import { z } from 'zod';

// Browser-safe, transport-agnostic SAP B1 DTOs. This module is a graph LEAF:
// it imports ONLY `zod`. It must NEVER import `@cpq/sap-b1` or any transport
// dependency (undici / tough-cookie / fast-xml-parser) — that would poison the
// contract package's isomorphism. Entity *shapes* discovered from $metadata are
// kept OPAQUE here (`z.record(z.string(), z.unknown())`) so the leaf need not
// know SAP-B1's concrete schema types.

/** A Service Layer entity-set name (e.g. `Items`, `BusinessPartners`, `Quotations`). */
export const EntitySetName = z.string();
export type EntitySetName = z.infer<typeof EntitySetName>;

/**
 * An entity key: a single string (`ItemCode`), a single number (`DocEntry`),
 * or a composite key as a flat record of string/number members.
 */
export const EntityKey = z.union([
  z.string(),
  z.number(),
  z.record(z.string(), z.union([z.string(), z.number()])),
]);
export type EntityKey = z.infer<typeof EntityKey>;

/** An opaque entity record — the concrete field shape is metadata-driven, not modelled here. */
export const EntityRecord = z.record(z.string(), z.unknown());
export type EntityRecord = z.infer<typeof EntityRecord>;

/** OData query options for a list read (Service Layer `$`-prefixed system options + our paging cap). */
export const EntityQuery = z.object({
  filter: z.string().optional(),
  select: z.string().optional(),
  orderby: z.string().optional(),
  top: z.number().int().optional(),
  skip: z.number().int().optional(),
  expand: z.string().optional(),
  pageSize: z.number().int().max(100).optional(),
});
export type EntityQuery = z.infer<typeof EntityQuery>;

/** The CRUD/action operations an entity may expose. */
export const EntityOp = z.enum(['read', 'create', 'update', 'delete', 'action']);
export type EntityOp = z.infer<typeof EntityOp>;

/** Per-tenant allowlist configuration for one entity set. */
export const EntityConfig = z.object({
  entitySet: EntitySetName,
  enabledOps: z.array(EntityOp),
  labelField: z.string().optional(),
});
export type EntityConfig = z.infer<typeof EntityConfig>;

/**
 * The describe output for one entity set. `jsonSchema` is OPAQUE
 * (`z.record(z.string(), z.unknown())`) so the leaf needn't import sap-b1's
 * JSON-Schema types.
 */
export const DescribeOutput = z.object({
  entitySet: EntitySetName,
  keys: z.array(z.string()),
  jsonSchema: z.record(z.string(), z.unknown()),
  enums: z.record(z.string(), z.array(z.string())).optional(),
  hasActions: z.boolean(),
  actions: z.array(z.string()),
});
export type DescribeOutput = z.infer<typeof DescribeOutput>;

/** A discovered entity set, with its current allowlist state. */
export const DiscoveredEntity = z.object({
  entitySet: EntitySetName,
  enabled: z.boolean(),
  enabledOps: z.array(EntityOp),
  hasActions: z.boolean(),
});
export type DiscoveredEntity = z.infer<typeof DiscoveredEntity>;

/** A record paired with its Service Layer ETag for optimistic concurrency. */
export const RecordWithEtag = z.object({
  record: EntityRecord,
  etag: z.string().optional(),
});
export type RecordWithEtag = z.infer<typeof RecordWithEtag>;

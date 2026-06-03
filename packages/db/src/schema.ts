import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  jsonb,
  timestamp,
  index,
  uniqueIndex,
  vector,
} from 'drizzle-orm/pg-core';

// Every tenant-scoped table carries tenantId. In P0 scoping is enforced at the
// repo layer (withTenant); the SaaS hardening (RLS / SET LOCAL) layers on later.

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const provenanceEnum = pgEnum('provenance', ['manual', 'ai', 'suggested', 'locked']);
export const configModeEnum = pgEnum('config_mode', ['manual', 'ai']);
export const configStatusEnum = pgEnum('config_status', ['draft', 'valid', 'committed']);
export const mappingStatusEnum = pgEnum('mapping_status', ['pending', 'committed', 'failed']);

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    email: text('email').notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('users_tenant_email_idx').on(t.tenantId, t.email)],
);

// Append-only audit trail. Every write records the originating requestId
// (correlates with the ALS request context). No UPDATE/DELETE at the repo layer.
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    requestId: text('request_id').notNull(),
    actor: text('actor'),
    action: text('action').notNull(),
    entity: text('entity'),
    entityId: text('entity_id'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('audit_log_tenant_created_idx').on(t.tenantId, t.createdAt)],
);

// Tracks the framework meta-schema version (FrameworkSchema.schemaVersion) lineage.
export const schemaVersions = pgTable('schema_versions', {
  version: integer('version').primaryKey(),
  description: text('description').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
});

// Mutable head pointer per framework key; headVersionHash -> framework_versions.contentHash.
export const frameworks = pgTable(
  'frameworks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    key: text('key').notNull(),
    headVersionHash: text('head_version_hash').references(() => frameworkVersions.contentHash),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('frameworks_tenant_key_idx').on(t.tenantId, t.key)],
);

// Immutable, content-hashed framework snapshots. contentHash (sha256, 64 hex)
// IS the identity — same content => same row. Repo layer forbids UPDATE/DELETE.
export const frameworkVersions = pgTable(
  'framework_versions',
  {
    contentHash: text('content_hash').primaryKey(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    frameworkKey: text('framework_key').notNull(),
    framework: jsonb('framework').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('framework_versions_tenant_key_idx').on(t.tenantId, t.frameworkKey)],
);

// A configuration session bound to an immutable framework version.
// state = { values, derived, provenance } — the ConfigState shape from @cpq/contract.
export const configurations = pgTable(
  'configurations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    frameworkVersionHash: text('framework_version_hash')
      .notNull()
      .references(() => frameworkVersions.contentHash),
    state: jsonb('state')
      .$type<{
        values: Record<string, unknown>;
        derived: Record<string, unknown>;
        provenance: Record<string, string>;
      }>()
      .notNull(),
    mode: configModeEnum('mode').notNull().default('manual'),
    status: configStatusEnum('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('configurations_tenant_idx').on(t.tenantId)],
);

// Vector store for similarity (P3). embeddingModel is the index identity — NOT
// hot-swappable; dims pinned at 1536 (text-embedding-3-small). HNSW + cosine.
export const itemEmbeddings = pgTable(
  'item_embeddings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    familyId: text('family_id').notNull(),
    embeddingModel: text('embedding_model').notNull(),
    embeddingDim: integer('embedding_dim').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    features: jsonb('features').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('item_embeddings_hnsw_idx').using('hnsw', t.embedding.op('vector_cosine_ops'))],
);

// Maps a config/commit to its SAP object ids (spec §15). The (tenantId,
// idempotencyKey) unique index is the dedup gate: a replayed commit returns the
// committed row instead of POSTing a second Quotation to Service Layer.
export const mappingLog = pgTable(
  'mapping_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id),
    idempotencyKey: text('idempotency_key').notNull(),
    configId: uuid('config_id').references(() => configurations.id),
    sapObjectType: text('sap_object_type').notNull(),
    sapDocEntry: integer('sap_doc_entry'),
    sapDocNum: integer('sap_doc_num'),
    status: mappingStatusEnum('status').notNull().default('pending'),
    requestId: text('request_id').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    response: jsonb('response').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex('mapping_log_tenant_idem_idx').on(t.tenantId, t.idempotencyKey)],
);

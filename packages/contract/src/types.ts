import { z } from 'zod';

export const FieldSchema = z.object({
  key: z.string(),
  kind: z.enum(['number', 'enum', 'boolean', 'text']),
  label: z.string(),
  domain: z.array(z.union([z.string(), z.number()])).optional(), // enum members
  min: z.number().optional(),
  max: z.number().optional(),
  required: z.boolean().default(false),
});

export const ConstraintSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('requires'),
    if: z.object({ field: z.string(), eq: z.union([z.string(), z.number(), z.boolean()]) }),
    then: z.object({ field: z.string(), in: z.array(z.union([z.string(), z.number(), z.boolean()])) }),
  }),
  z.object({
    type: z.literal('excludes'),
    a: z.object({ field: z.string(), eq: z.union([z.string(), z.number(), z.boolean()]) }),
    b: z.object({ field: z.string(), eq: z.union([z.string(), z.number(), z.boolean()]) }),
  }),
  z.object({ type: z.literal('range'), field: z.string(), min: z.number().optional(), max: z.number().optional() }),
  z.object({
    type: z.literal('allowedCombo'),
    fields: z.array(z.string()),
    combos: z.array(z.array(z.union([z.string(), z.number(), z.boolean()]))),
  }),
]);

const FrameworkV1 = z.object({
  schemaVersion: z.literal(1),
  key: z.string(),
  fields: z.array(FieldSchema),
  constraints: z.array(ConstraintSchema).default([]),
  formulas: z.array(z.object({ target: z.string(), expr: z.string() })).default([]),
  decisionTables: z.array(z.object({ target: z.string(), jdm: z.unknown() })).default([]), // GoRules JDM; evaluated backend-only (P2)
});
export const FrameworkSchema = z.discriminatedUnion('schemaVersion', [FrameworkV1]);
export type Framework = z.infer<typeof FrameworkSchema>;
export const FrameworkHashSchema = z.string().length(64).brand<'FrameworkHash'>();
export type FrameworkHash = z.infer<typeof FrameworkHashSchema>;

export const ProvenanceSchema = z.enum(['manual', 'ai', 'suggested', 'locked']);
export const ConfigStateSchema = z.object({
  values: z.record(z.string(), z.unknown()),
  derived: z.record(z.string(), z.unknown()).default({}),
  provenance: z.record(z.string(), ProvenanceSchema).default({}),
});
export type ConfigState = z.infer<typeof ConfigStateSchema>;

export const IssueSchema = z.object({
  field: z.string().optional(),
  code: z.enum(['unknown_field', 'type', 'required', 'domain', 'constraint', 'range']),
  message: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;
export const ValidateResultSchema = z.object({
  valid: z.boolean(),
  issues: z.array(IssueSchema),
  narrowedDomains: z.record(z.string(), z.array(z.union([z.string(), z.number()]))),
  derived: z.record(z.string(), z.unknown()),
});
export type ValidateResult = z.infer<typeof ValidateResultSchema>;

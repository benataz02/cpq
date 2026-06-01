import { z } from 'zod';
export const EdmType = z.enum(['String','Int32','Int64','Double','Decimal','DateTimeOffset','Date','Time','Boolean','Guid','Enum','unknown']);
export type EdmType = z.infer<typeof EdmType>;
export const PropertySchema = z.object({ name: z.string(), edmType: EdmType, nullable: z.boolean(), maxLength: z.number().int().positive().optional(), enumType: z.string().optional(), isKey: z.boolean().default(false) });
export type SapProperty = z.infer<typeof PropertySchema>;
export const NavPropertySchema = z.object({ name: z.string(), target: z.string(), collection: z.boolean() });
export type SapNavProperty = z.infer<typeof NavPropertySchema>;
export const KeyRefSchema = z.object({ name: z.string(), edmType: EdmType });
export type SapKeyRef = z.infer<typeof KeyRefSchema>;
export const EntitySetSchema = z.object({ name: z.string(), entityType: z.string(), keys: z.array(KeyRefSchema), properties: z.array(PropertySchema), navProps: z.array(NavPropertySchema), actions: z.array(z.string()) });
export type SapEntitySet = z.infer<typeof EntitySetSchema>;
export const EnumMemberSchema = z.object({ name: z.string(), value: z.string() });
export type SapEnumMember = z.infer<typeof EnumMemberSchema>;
export interface SapMetadata { entitySets: Map<string, SapEntitySet>; enums: Map<string, SapEnumMember[]>; fetchedAt: number; }

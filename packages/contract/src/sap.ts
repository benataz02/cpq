import { z } from 'zod';

// SAP B1 Service Layer DTOs — PURE Zod data shapes, browser-safe, so the same
// schemas back both the oRPC wire contract (here) and the @cpq/sap-b1 client's
// edge validation. One model, zero drift — the same discipline as validate().
//
// B1 entities carry hundreds of fields; we validate the subset we read/write and
// `.passthrough()` (loose) the rest rather than rejecting unknown server fields.

/** Service Layer Login response. */
export const SessionSchema = z.object({
  SessionId: z.string(),
  SessionTimeout: z.number().optional(), // minutes
});
export type Session = z.infer<typeof SessionSchema>;

export const SapItemSchema = z.looseObject({
  ItemCode: z.string(),
  ItemName: z.string().nullable().optional(),
  ItemsGroupCode: z.number().nullable().optional(),
  InventoryUOM: z.string().nullable().optional(),
});
export type SapItem = z.infer<typeof SapItemSchema>;

export const SapBusinessPartnerSchema = z.looseObject({
  CardCode: z.string(),
  CardName: z.string().nullable().optional(),
  CardType: z.string().nullable().optional(), // cCustomer | cSupplier | cLid
});
export type SapBusinessPartner = z.infer<typeof SapBusinessPartnerSchema>;

export const SapProductTreeLineSchema = z.looseObject({
  ItemCode: z.string(),
  Quantity: z.number().nullable().optional(),
  Warehouse: z.string().nullable().optional(),
  IssueMethod: z.string().nullable().optional(), // im_Backflush | im_Manual
});
export type SapProductTreeLine = z.infer<typeof SapProductTreeLineSchema>;

export const SapProductTreeSchema = z.looseObject({
  TreeCode: z.string(),
  TreeType: z.string().nullable().optional(), // iProductionTree for production BOMs
  ProductTreeLines: z.array(SapProductTreeLineSchema).default([]),
});
export type SapProductTree = z.infer<typeof SapProductTreeSchema>;

// --- Quotation (write) ---
export const SapQuotationLineSchema = z.object({
  ItemCode: z.string(),
  Quantity: z.number(),
  UnitPrice: z.number().optional(),
  WarehouseCode: z.string().optional(),
});
export type SapQuotationLine = z.infer<typeof SapQuotationLineSchema>;

export const SapQuotationCreateSchema = z.object({
  CardCode: z.string(),
  DocDueDate: z.string().optional(), // ISO date (yyyy-mm-dd)
  Comments: z.string().optional(),
  DocumentLines: z.array(SapQuotationLineSchema).min(1),
});
export type SapQuotationCreate = z.infer<typeof SapQuotationCreateSchema>;

/** Service Layer echoes the created Quotation; we only need its identity. */
export const SapQuotationResultSchema = z.looseObject({
  DocEntry: z.number(),
  DocNum: z.number().nullable().optional(),
});
export type SapQuotationResult = z.infer<typeof SapQuotationResultSchema>;

/** OData v4 collection envelope: `{ value: T[], '@odata.nextLink'?: string }`. */
export const odataList = <T extends z.ZodType>(item: T) =>
  z.looseObject({
    value: z.array(item),
    '@odata.nextLink': z.string().optional(),
  });

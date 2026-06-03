import { oc } from '@orpc/contract';
import { z } from 'zod';
import { FrameworkSchema, ConfigStateSchema, ValidateResultSchema } from './types.js';
import {
  SapItemSchema,
  SapBusinessPartnerSchema,
  SapProductTreeSchema,
  SapQuotationCreateSchema,
} from './sap.js';

export const contract = {
  system: {
    ping: oc
      .route({ method: 'POST', path: '/system/ping' })
      .input(z.object({ msg: z.string() }))
      .output(z.object({ pong: z.string(), at: z.number() })),
  },
  framework: {
    validate: oc
      .route({ method: 'POST', path: '/framework/validate' })
      .input(z.object({ framework: FrameworkSchema, state: ConfigStateSchema }))
      .output(ValidateResultSchema),
  },
  // Deterministic, NON-AI Service Layer surface (SAP API Policy §2.2.2): plain
  // handlers in apps/api call @cpq/sap-b1 directly — no agent plans these calls.
  sap: {
    items: {
      list: oc
        .route({ method: 'POST', path: '/sap/items/list' })
        .input(z.object({ skip: z.number().optional(), top: z.number().optional(), filter: z.string().optional() }))
        .output(z.object({ items: z.array(SapItemSchema), nextLink: z.string().optional() })),
    },
    businessPartners: {
      list: oc
        .route({ method: 'POST', path: '/sap/business-partners/list' })
        .input(z.object({ skip: z.number().optional(), top: z.number().optional(), filter: z.string().optional() }))
        .output(z.object({ items: z.array(SapBusinessPartnerSchema), nextLink: z.string().optional() })),
    },
    bom: {
      get: oc
        .route({ method: 'POST', path: '/sap/bom/get' })
        .input(z.object({ treeCode: z.string() }))
        .output(SapProductTreeSchema),
    },
    quotation: {
      create: oc
        .route({ method: 'POST', path: '/sap/quotation/create' })
        .input(z.object({ quotation: SapQuotationCreateSchema, idempotencyKey: z.string().optional() }))
        .output(
          z.object({
            docEntry: z.number(),
            docNum: z.number().nullable(),
            mappingLogId: z.string(),
            idempotencyKey: z.string(),
            replayed: z.boolean(),
          }),
        ),
    },
  },
};
export type Contract = typeof contract;

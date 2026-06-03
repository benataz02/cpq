import { implement } from '@orpc/server';
import {
  contract,
  validate,
  hashCanonical,
  type SapItem,
  type SapBusinessPartner,
  type SapProductTree,
  type SapQuotationCreate,
  type SapQuotationResult,
} from '@cpq/contract';
import { getContext, logger } from '@cpq/core/server';
import { mappingLogRepo, appendAudit } from '@cpq/db';
import { getSapClient } from './sapClient.js';

// IMPLEMENT the shared contract. Both the RPC and OpenAPI handlers serve this
// single router — one router, two surfaces, zero drift.
const os = implement(contract);

// --- Ports: the deterministic SAP path + its persistence, injectable for tests ---
interface ListPage<T> {
  items: T[];
  nextLink?: string;
}
interface SapPort {
  getItems(q: { skip?: number; top?: number; filter?: string }): Promise<ListPage<SapItem>>;
  getBusinessPartners(q: { skip?: number; top?: number; filter?: string }): Promise<ListPage<SapBusinessPartner>>;
  getProductTree(treeCode: string): Promise<SapProductTree>;
  createQuotation(q: SapQuotationCreate): Promise<SapQuotationResult>;
}
interface MappingRecord {
  id: string;
  status: 'pending' | 'committed' | 'failed';
  sapDocEntry: number | null;
  sapDocNum: number | null;
}
interface MappingStore {
  findByIdempotencyKey(key: string): Promise<MappingRecord | undefined>;
  insertPending(input: {
    idempotencyKey: string;
    sapObjectType: string;
    payload: Record<string, unknown>;
  }): Promise<MappingRecord>;
  markCommitted(id: string, input: { sapDocEntry: number; sapDocNum: number | null; response: Record<string, unknown> }): Promise<MappingRecord>;
  markFailed(id: string, response: Record<string, unknown>): Promise<void>;
}
interface AuditPort {
  append(entry: { action: string; entity?: string; entityId?: string; data?: Record<string, unknown> }): Promise<void>;
}
export interface RouterDeps {
  sap: SapPort;
  store: MappingStore;
  audit: AuditPort;
}

// Production deps: the lazy SAP client + the Drizzle-backed repos. The SAP port
// resolves the singleton per-call so the server still boots without SAP config.
export function defaultDeps(): RouterDeps {
  return {
    sap: {
      getItems: (q) => getSapClient().getItems(q),
      getBusinessPartners: (q) => getSapClient().getBusinessPartners(q),
      getProductTree: (c) => getSapClient().getProductTree(c),
      createQuotation: (q) => getSapClient().createQuotation(q),
    },
    store: mappingLogRepo,
    audit: { append: appendAudit },
  };
}

export function buildRouter(deps: RouterDeps) {
  return os.router({
    system: {
      ping: os.system.ping.handler(({ input }) => {
        const { requestId, tenantId } = getContext(); // reads ALS — throws if not bound (proves acceptance #2)
        logger.info({ requestId, tenantId, ping: input.msg }, 'system.ping');
        return { pong: input.msg, at: Date.now() };
      }),
    },
    framework: {
      validate: os.framework.validate.handler(({ input }) => validate(input.framework, input.state)),
    },
    // Deterministic, NON-AI Service Layer path (SAP API Policy §2.2.2).
    sap: {
      items: {
        list: os.sap.items.list.handler(async ({ input }) => {
          const page = await deps.sap.getItems(input);
          return { items: page.items, nextLink: page.nextLink };
        }),
      },
      businessPartners: {
        list: os.sap.businessPartners.list.handler(async ({ input }) => {
          const page = await deps.sap.getBusinessPartners(input);
          return { items: page.items, nextLink: page.nextLink };
        }),
      },
      bom: {
        get: os.sap.bom.get.handler(({ input }) => deps.sap.getProductTree(input.treeCode)),
      },
      quotation: {
        // Idempotent commit: a replayed key returns the committed row instead of
        // POSTing a second Quotation. A failed/pending row is reused and retried.
        create: os.sap.quotation.create.handler(async ({ input }) => {
          const idempotencyKey = input.idempotencyKey ?? (await hashCanonical(input.quotation));
          const existing = await deps.store.findByIdempotencyKey(idempotencyKey);
          if (existing?.status === 'committed') {
            return {
              docEntry: existing.sapDocEntry ?? 0,
              docNum: existing.sapDocNum,
              mappingLogId: existing.id,
              idempotencyKey,
              replayed: true,
            };
          }
          const pending =
            existing ??
            (await deps.store.insertPending({
              idempotencyKey,
              sapObjectType: 'Quotation',
              payload: input.quotation,
            }));
          try {
            const res = await deps.sap.createQuotation(input.quotation);
            const docNum = res.DocNum ?? null;
            await deps.store.markCommitted(pending.id, { sapDocEntry: res.DocEntry, sapDocNum: docNum, response: res });
            await deps.audit.append({
              action: 'sap.quotation.create',
              entity: 'Quotation',
              entityId: String(res.DocEntry),
              data: { idempotencyKey, docNum },
            });
            return { docEntry: res.DocEntry, docNum, mappingLogId: pending.id, idempotencyKey, replayed: false };
          } catch (e) {
            await deps.store.markFailed(pending.id, { error: String(e) });
            throw e;
          }
        }),
      },
    },
  });
}

export const router = buildRouter(defaultDeps());
export type AppRouter = typeof router;

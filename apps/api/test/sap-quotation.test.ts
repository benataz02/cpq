import { describe, expect, it, vi } from 'vitest';
import { createRouterClient } from '@orpc/server';
import { buildRouter, type RouterDeps } from '../src/router';

interface Row {
  id: string;
  idempotencyKey: string;
  status: 'pending' | 'committed' | 'failed';
  sapDocEntry: number | null;
  sapDocNum: number | null;
}

// In-memory deps: exercises the handler's idempotency/replay logic end-to-end
// without a live SAP sandbox or Postgres (both are the documented switch-on step).
function fakeDeps() {
  const rows = new Map<string, Row>();
  let seq = 0;
  const sap = {
    getItems: vi.fn(async () => ({ items: [{ ItemCode: 'CFG-1' }], nextLink: 'Items?$skip=1' })),
    getBusinessPartners: vi.fn(async () => ({ items: [] })),
    getProductTree: vi.fn(),
    createQuotation: vi.fn(async () => ({ DocEntry: 99, DocNum: 1099 })),
  };
  const store = {
    findByIdempotencyKey: async (k: string) => [...rows.values()].find((r) => r.idempotencyKey === k),
    insertPending: async (i: { idempotencyKey: string }) => {
      const r: Row = { id: `m-${++seq}`, idempotencyKey: i.idempotencyKey, status: 'pending', sapDocEntry: null, sapDocNum: null };
      rows.set(r.id, r);
      return r;
    },
    markCommitted: async (id: string, inp: { sapDocEntry: number; sapDocNum: number | null }) => {
      const r = rows.get(id)!;
      Object.assign(r, { status: 'committed', sapDocEntry: inp.sapDocEntry, sapDocNum: inp.sapDocNum });
      return r;
    },
    markFailed: async (id: string) => {
      const r = rows.get(id);
      if (r) r.status = 'failed';
    },
  };
  const audit = { append: vi.fn(async () => {}) };
  const deps = { sap, store, audit } as unknown as RouterDeps;
  return { deps, sap, store, audit, rows };
}

const quotation = { CardCode: 'C0001', DocumentLines: [{ ItemCode: 'CFG-1', Quantity: 2 }] };

describe('sap.quotation.create (idempotent commit)', () => {
  it('commits once, audits, and a same-key replay does NOT re-POST', async () => {
    const { deps, sap, audit, rows } = fakeDeps();
    const client = createRouterClient(buildRouter(deps));

    const first = await client.sap.quotation.create({ quotation });
    expect(first.replayed).toBe(false);
    expect(first.docEntry).toBe(99);
    expect(first.docNum).toBe(1099);
    expect(sap.createQuotation).toHaveBeenCalledTimes(1);
    expect(audit.append).toHaveBeenCalledTimes(1);
    expect([...rows.values()][0].status).toBe('committed');

    const second = await client.sap.quotation.create({ quotation });
    expect(second.replayed).toBe(true);
    expect(second.docEntry).toBe(99);
    expect(second.mappingLogId).toBe(first.mappingLogId);
    expect(sap.createQuotation).toHaveBeenCalledTimes(1); // not re-posted
    expect(audit.append).toHaveBeenCalledTimes(1);
  });

  it('marks failed on a SAP error, then a retry reuses the row and commits', async () => {
    const { deps, sap, rows } = fakeDeps();
    sap.createQuotation
      .mockRejectedValueOnce(new Error('SAP 400: boom'))
      .mockResolvedValueOnce({ DocEntry: 7, DocNum: 1007 });
    const client = createRouterClient(buildRouter(deps));

    await expect(client.sap.quotation.create({ quotation })).rejects.toThrow(/boom/);
    expect([...rows.values()][0].status).toBe('failed');
    expect(rows.size).toBe(1);

    const retry = await client.sap.quotation.create({ quotation });
    expect(retry.replayed).toBe(false);
    expect(retry.docEntry).toBe(7);
    expect(rows.size).toBe(1); // reused the same mapping_log row (no unique-key violation)
    expect(sap.createQuotation).toHaveBeenCalledTimes(2);
  });

  it('honors a caller-supplied idempotencyKey', async () => {
    const { deps, sap } = fakeDeps();
    const client = createRouterClient(buildRouter(deps));
    const r1 = await client.sap.quotation.create({ quotation, idempotencyKey: 'order-42' });
    expect(r1.idempotencyKey).toBe('order-42');
    const r2 = await client.sap.quotation.create({ quotation, idempotencyKey: 'order-42' });
    expect(r2.replayed).toBe(true);
    expect(sap.createQuotation).toHaveBeenCalledTimes(1);
  });
});

describe('sap reads', () => {
  it('items.list passes the page + nextLink through', async () => {
    const { deps } = fakeDeps();
    const client = createRouterClient(buildRouter(deps));
    const res = await client.sap.items.list({ top: 1 });
    expect(res.items.map((i) => i.ItemCode)).toEqual(['CFG-1']);
    expect(res.nextLink).toBe('Items?$skip=1');
  });
});

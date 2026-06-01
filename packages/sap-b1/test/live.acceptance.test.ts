import { describe, expect, it } from 'vitest';
import { getSapGateway, sapRegistry } from '../src/index';

/**
 * P1 LIVE acceptance — the SAP round-trip gate.
 *
 * Env-gated: this whole suite SKIPS cleanly unless `SAP_BASE_URL` is set, so CI (and any environment without
 * sandbox credentials) stays green. The real run is a manual step against a SAP B1 sandbox:
 *
 *   SAP_BASE_URL=…/b1s/v2 SAP_COMPANY_DB=… SAP_USERNAME=… SAP_PASSWORD=… \
 *     SAP_REJECT_UNAUTHORIZED=false pnpm -F @cpq/sap-b1 test live
 *
 * It exercises the `@cpq/sap-b1` gateway + per-tenant metadata store DIRECTLY (no `@cpq/db`, no API layer): the
 * `entityConfig` allowlist is an api-layer concern, tested separately, and `packages/sap-b1` does not depend on
 * `@cpq/db` — so it is intentionally out of scope here. This proves the P1 Accept: a round-trip read plus a
 * Quotation written to (and then cancelled on) the sandbox.
 */
const TENANT = 'demo';

describe.skipIf(!process.env.SAP_BASE_URL)('LIVE acceptance (SAP sandbox)', () => {
  it('refreshes metadata and exposes Quotations with the Cancel action', async () => {
    const store = sapRegistry.getStore(TENANT);
    await store.refresh();
    const meta = await store.get();

    // A real Service Layer $metadata exposes hundreds of entity sets.
    expect(meta.entitySets.size).toBeGreaterThan(50);

    const quotations = meta.entitySets.get('Quotations');
    expect(quotations).toBeDefined();
    expect(quotations?.actions).toContain('Cancel');
  });

  it('round-trips a BusinessPartner: create → get → update (If-Match) → delete', async () => {
    const gw = getSapGateway(TENANT);
    const cardCode = `CPQ_T${Date.now()}`;

    const created = await gw.create('BusinessPartners', {
      CardCode: cardCode,
      CardName: 'CPQ Acceptance BP',
      CardType: 'cCustomer',
    });
    expect(created.data).toMatchObject({ CardCode: cardCode });

    const fetched = await gw.get('BusinessPartners', cardCode);
    expect(fetched.data).toMatchObject({ CardCode: cardCode });
    const etag = fetched.etag ?? created.etag;
    expect(etag).toBeDefined();

    const updated = await gw.update(
      'BusinessPartners',
      cardCode,
      { CardName: 'CPQ Acceptance BP (renamed)' },
      { etag: etag as string },
    );
    const afterUpdate = updated.etag ?? (await gw.get('BusinessPartners', cardCode)).etag;
    expect(afterUpdate).toBeDefined();

    // Teardown: BusinessPartners DELETE is permitted (unlike Quotations).
    await gw.del('BusinessPartners', cardCode, { etag: afterUpdate as string });
  });

  it('writes a Quotation: create → get → Cancel (DELETE is forbidden on Quotations)', async () => {
    const gw = getSapGateway(TENANT);
    const cardCode = process.env.SAP_QUOTE_CARDCODE ?? 'C20000';
    const itemCode = process.env.SAP_QUOTE_ITEMCODE ?? 'A00001';

    const quote = await gw.create('Quotations', {
      CardCode: cardCode,
      DocumentLines: [{ ItemCode: itemCode, Quantity: 1 }],
    });
    const docEntry = (quote.data as { DocEntry?: number }).DocEntry;
    expect(typeof docEntry).toBe('number');

    const fetched = await gw.get('Quotations', docEntry as number);
    expect(fetched.data).toMatchObject({ DocEntry: docEntry });

    // Teardown: Quotations cannot be DELETEd — the Cancel bound action is the correct reversal.
    await gw.callAction('Quotations', docEntry as number, 'Cancel');
  });
});

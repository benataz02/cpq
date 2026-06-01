import { SapClient } from './client.js';
import { MetadataStore } from './metadata/store.js';
import { SapGateway } from './gateway.js';
import { resolveSapConfig } from './config.js';

/** The per-tenant trio: the transport client, its metadata cache, and the gateway that binds them. */
interface SapTrio {
  client: SapClient;
  store: MetadataStore;
  gateway: SapGateway;
}

/**
 * Lazily creates and caches one {@link SapClient}/{@link MetadataStore}/{@link SapGateway} trio per tenant.
 * The store's metadata fetch is wired to `client.requestRaw('/$metadata')` (the XML content-type branch in
 * the client's `roundTrip` returns the raw EDMX text, so `body as string` is sound).
 */
export class SapClientRegistry {
  private readonly tenants = new Map<string, SapTrio>();

  /** Get-or-create the cached trio for `tenantId` (resolving config + wiring the metadata fetcher once). */
  private trio(tenantId: string): SapTrio {
    let trio = this.tenants.get(tenantId);
    if (!trio) {
      const cfg = resolveSapConfig(tenantId);
      const client = new SapClient(cfg.baseUrl, cfg.creds, {
        rejectUnauthorized: cfg.rejectUnauthorized,
      });
      const store = new MetadataStore({
        fetchMetadataXml: async () => (await client.requestRaw('/$metadata')).body as string,
      });
      const gateway = new SapGateway(client, store);
      trio = { client, store, gateway };
      this.tenants.set(tenantId, trio);
    }
    return trio;
  }

  /** The metadata-driven CRUD/action gateway for `tenantId`. */
  getGateway(tenantId: string): SapGateway {
    return this.trio(tenantId).gateway;
  }

  /** The metadata store for `tenantId` (e.g. to `refresh()` after a schema change). */
  getStore(tenantId: string): MetadataStore {
    return this.trio(tenantId).store;
  }
}

/** The process-wide registry of per-tenant SAP clients. */
export const sapRegistry = new SapClientRegistry();

/** Convenience accessor: the {@link SapGateway} for `tenantId` from the shared {@link sapRegistry}. */
export function getSapGateway(tenantId: string): SapGateway {
  return sapRegistry.getGateway(tenantId);
}

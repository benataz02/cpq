import { parseEdmx } from './edmx.js';
import type { SapEntitySet, SapMetadata } from './model.js';

/** Source of the raw `$metadata` EDMX XML. The registry wires this to `SapClient.requestRaw('/$metadata')`. */
export interface MetadataFetcher {
  fetchMetadataXml(): Promise<string>;
}

/**
 * Per-tenant in-memory cache of parsed `SapMetadata`. Lazy: the first `get()` fetches + parses; later
 * `get()`s reuse the cached instance. Single-flight: concurrent `get()`s during a load share **one**
 * in-flight promise (so the fetcher fires exactly once), mirroring `SapClient.ensureSession()`.
 */
export class MetadataStore {
  private cached: SapMetadata | null = null;
  private inflight: Promise<SapMetadata> | null = null;

  constructor(private readonly fetcher: MetadataFetcher) {}

  /** Lazily load (once) and reuse the parsed metadata; concurrent callers share the in-flight load. */
  async get(): Promise<SapMetadata> {
    if (this.cached) return this.cached;
    return (this.inflight ??= this.load().finally(() => {
      this.inflight = null;
    }));
  }

  /** Drop the cache and re-fetch + re-parse (e.g. after a schema change in SAP). */
  async refresh(): Promise<SapMetadata> {
    this.cached = null;
    return this.get();
  }

  /** Resolve one entity set from the (lazily loaded) metadata, or throw on an unknown name. */
  async entitySet(name: string): Promise<SapEntitySet> {
    const meta = await this.get();
    const es = meta.entitySets.get(name);
    if (!es) throw new Error(`Unknown entity set: ${name}`);
    return es;
  }

  private async load(): Promise<SapMetadata> {
    const xml = await this.fetcher.fetchMetadataXml();
    this.cached = parseEdmx(xml);
    return this.cached;
  }
}

import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { MetadataFetcher } from '../src/metadata/store';
import { MetadataStore } from '../src/metadata/store';

const xml = readFileSync(new URL('./fixtures/metadata.edmx.xml', import.meta.url), 'utf8');

/** A fake fetcher that counts calls and resolves on the next microtask (so concurrent get()s overlap). */
function fakeFetcher(): MetadataFetcher & { calls: number } {
  const f = {
    calls: 0,
    async fetchMetadataXml(): Promise<string> {
      f.calls += 1;
      await Promise.resolve();
      return xml;
    },
  };
  return f;
}

describe('MetadataStore', () => {
  it('get() parses once and reuses — single-flight across 3 concurrent get()s', async () => {
    const fetcher = fakeFetcher();
    const store = new MetadataStore(fetcher);

    const [a, b, c] = await Promise.all([store.get(), store.get(), store.get()]);

    expect(fetcher.calls).toBe(1); // single-flight: the fetcher fired exactly once
    expect(a).toBe(b); // same cached SapMetadata instance reused
    expect(b).toBe(c);
    expect(a.entitySets.has('BusinessPartners')).toBe(true);

    // A subsequent get() also reuses the cache (no re-fetch).
    const again = await store.get();
    expect(fetcher.calls).toBe(1);
    expect(again).toBe(a);
  });

  it('refresh() clears the cache and re-fetches', async () => {
    const fetcher = fakeFetcher();
    const store = new MetadataStore(fetcher);

    const first = await store.get();
    expect(fetcher.calls).toBe(1);

    const refreshed = await store.refresh();
    expect(fetcher.calls).toBe(2); // re-fetched
    expect(refreshed).not.toBe(first); // a freshly parsed instance
    expect(refreshed.entitySets.has('Quotations')).toBe(true);
  });

  it('entitySet(name) returns the SapEntitySet or throws on unknown', async () => {
    const fetcher = fakeFetcher();
    const store = new MetadataStore(fetcher);

    const es = await store.entitySet('BusinessPartners');
    expect(es.name).toBe('BusinessPartners');

    await expect(store.entitySet('Unknown')).rejects.toThrow(/Unknown/);
  });

  it('does not re-invoke the fetcher when entitySet() loads lazily', async () => {
    const fetcher = fakeFetcher();
    const spy = vi.spyOn(fetcher, 'fetchMetadataXml');
    const store = new MetadataStore(fetcher);

    await store.entitySet('Quotations');
    await store.entitySet('BusinessPartners');

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

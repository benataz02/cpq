import type { Framework } from './types.js';

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object')
    return Object.fromEntries(
      Object.keys(v as object)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  return v;
}

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

/** SHA-256 over any value's canonical form. Isomorphic (Node 24 + browsers). */
export async function hashCanonical(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalize(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashFramework(framework: Framework): Promise<string> {
  return hashCanonical(framework);
}

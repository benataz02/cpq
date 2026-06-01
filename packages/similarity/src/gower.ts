export interface FeatureSpec {
  key: string;
  type: 'numeric' | 'categorical';
  range?: number;
  weight?: number;
}

// Gower distance in [0,1]: weighted mean of per-feature dissimilarities.
// Numeric: |a-b|/range (clamped to 1). Categorical: 0 if equal, else 1.
// Pure & dependency-free — the manual UI + similarity path needs no API key.
export function gower(a: Record<string, unknown>, b: Record<string, unknown>, specs: FeatureSpec[]): number {
  let num = 0,
    den = 0;
  for (const s of specs) {
    const w = s.weight ?? 1;
    den += w;
    if (s.type === 'numeric') {
      const r = s.range || 1;
      num += w * Math.min(1, Math.abs(Number(a[s.key]) - Number(b[s.key])) / r);
    } else {
      num += w * (a[s.key] === b[s.key] ? 0 : 1);
    }
  }
  return den ? num / den : 0;
}

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
    if (w <= 0) continue; // non-positive weights don't participate
    den += w;
    if (s.type === 'numeric') {
      const r = s.range && s.range > 0 ? s.range : 1; // guard non-positive range
      const av = Number(a[s.key]);
      const bv = Number(b[s.key]);
      // Non-numeric/missing values count as maximal dissimilarity, never NaN.
      const term = Number.isFinite(av) && Number.isFinite(bv) ? Math.min(1, Math.abs(av - bv) / r) : 1;
      num += w * term;
    } else {
      num += w * (a[s.key] === b[s.key] ? 0 : 1);
    }
  }
  // Fail fast on a degenerate spec rather than silently returning 0 ("identical").
  if (den === 0) throw new Error('gower: total feature weight is zero');
  return num / den; // guaranteed in [0, 1]
}

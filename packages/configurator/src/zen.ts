// ZEN decision tables are a backend-only P2 extension (native NAPI @gorules/zen-engine).
// The `derived` field SHAPE is locked in P0; this is the documented seam where the
// decision-table path will merge results into `derived` server-side.
export function evaluateDecisionTable(): never {
  throw new Error('ZEN decision tables: P2');
}

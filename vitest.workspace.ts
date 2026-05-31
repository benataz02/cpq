// Root Vitest workspace. Per-package configs are discovered here for root-level
// runs (`vitest`); Turbo also runs `vitest run` inside each package directly.
// The isomorphism (node + jsdom) projects live in packages/contract/vitest.config.ts.
export default ['packages/*/vitest.config.ts', 'apps/*/vitest.config.ts'];

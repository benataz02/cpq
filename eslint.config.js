// Flat ESLint config. Intentionally minimal: a TS-capable parser so ESLint can
// read .ts/.tsx, plus the architectural boundary rules. No style/recommended
// rule sets — `pnpm turbo run lint` must be GREEN across the repo, and fail
// ONLY on a real boundary violation (acceptance #7).
import boundaries from 'eslint-plugin-boundaries';
import tseslint from 'typescript-eslint';

/** Local package "elements" classified by path (for eslint-plugin-boundaries). */
const elements = [
  { type: 'contract', pattern: 'packages/contract/**' },
  { type: 'core', pattern: 'packages/core/**' },
  { type: 'db', pattern: 'packages/db/**' },
  { type: 'constraint-engine', pattern: 'packages/constraint-engine/**' },
  { type: 'expr', pattern: 'packages/expr/**' },
  { type: 'configurator', pattern: 'packages/configurator/**' },
  { type: 'sap-b1', pattern: 'packages/sap-b1/**' },
  { type: 'ai', pattern: 'packages/ai/**' },
  { type: 'similarity', pattern: 'packages/similarity/**' },
  { type: 'ui-renderers', pattern: 'packages/ui-renderers/**' },
  { type: 'app-api', pattern: 'apps/api/**' },
  { type: 'app-web', pattern: 'apps/web/**' },
];

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.turbo/**',
      '**/*.gen.ts',
      '**/routeTree.gen.ts',
      'packages/db/drizzle/**',
      'docker/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { boundaries },
    settings: {
      'boundaries/elements': elements,
      'boundaries/ignore': ['**/*.test.{ts,tsx}', '**/test/**', '**/*.config.{ts,js,mts}'],
    },
    rules: {
      // Architectural intent: apps/web is browser-only.
      'boundaries/external': [
        'error',
        {
          default: 'allow',
          rules: [
            {
              from: ['app-web'],
              disallow: [
                '@cpq/db',
                '@cpq/db/**',
                '@cpq/core/server',
                '@orpc/server',
                '@orpc/server/**',
              ],
              message:
                'apps/web is browser-only: import the oRPC client + @cpq/contract + @cpq/core (root) — never @cpq/db, @cpq/core/server, or @orpc/server*.',
            },
            {
              from: ['contract'],
              disallow: [
                '@cpq/sap-b1',
                '@cpq/sap-b1/**',
                'undici',
                'tough-cookie',
                'http-cookie-agent',
                'fast-xml-parser',
              ],
              message:
                '@cpq/contract is a browser-safe leaf: never import @cpq/sap-b1 or transport deps (undici/tough-cookie/http-cookie-agent/fast-xml-parser).',
            },
          ],
        },
      ],
    },
  },
  {
    // Reliable hard gate (matches the literal specifier regardless of how the
    // workspace symlink resolves). This is what makes acceptance #7 bite.
    files: ['apps/web/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@cpq/db', '@cpq/db/*'], message: 'apps/web must not import @cpq/db (server-only).' },
            { group: ['@cpq/core/server'], message: 'apps/web must not import @cpq/core/server (Node-only).' },
            { group: ['@orpc/server', '@orpc/server/*'], message: 'apps/web must use the oRPC client, not @orpc/server.' },
          ],
        },
      ],
    },
  },
  {
    // Reliable hard gate: @cpq/contract is a browser-safe leaf — it must never
    // import @cpq/sap-b1 or any transport dep, so the literal same validate()
    // import keeps running in Node and the browser.
    files: ['packages/contract/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['@cpq/sap-b1', '@cpq/sap-b1/*'], message: '@cpq/contract must not import @cpq/sap-b1 (browser-safe leaf).' },
            { group: ['undici'], message: '@cpq/contract must not import undici (transport dep — browser-safe leaf).' },
            { group: ['tough-cookie'], message: '@cpq/contract must not import tough-cookie (transport dep — browser-safe leaf).' },
            { group: ['http-cookie-agent'], message: '@cpq/contract must not import http-cookie-agent (transport dep — browser-safe leaf).' },
            { group: ['fast-xml-parser'], message: '@cpq/contract must not import fast-xml-parser (transport dep — browser-safe leaf).' },
          ],
        },
      ],
    },
  },
];

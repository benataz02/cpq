import { defineConfig } from 'vitest/config';

// Two Vitest projects run the SHARED `*.iso.test.ts` files under different
// environments. This is acceptance #5: the *identical* validate() import must
// behave the same in Node and in a browser-like (jsdom) environment, proving
// the contract package's dependency tree is genuinely isomorphic.
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'node',
          environment: 'node',
          include: ['test/**/*.node.test.ts', 'test/**/*.iso.test.ts', 'test/canonical.test.ts'],
        },
      },
      {
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['test/**/*.jsdom.test.ts', 'test/**/*.iso.test.ts'],
        },
      },
    ],
  },
});

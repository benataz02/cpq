// CVE / supply-chain policy gate. Fails CI if pnpm-lock.yaml resolves any banned
// package, or mathjs below the security floor. Deterministic (lockfile-based).
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BANNED = ['expr-eval', 'expr-eval-fork', 'b1-service-layer'];
const MATHJS_FLOOR = [15, 2, 0]; // CVE-2026-40897 closed in 15.2.0

const lockPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'pnpm-lock.yaml');
const lock = readFileSync(lockPath, 'utf8');

// Match `name@version` tokens (optionally scoped), as they appear in lockfile keys.
const pkgRe = /(?:^|[\s'"/(])((?:@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*)@(\d+\.\d+\.\d+[^\s'":(),]*)/gim;

const failures = [];
const seen = new Set();
let m;
while ((m = pkgRe.exec(lock)) !== null) {
  const name = m[1];
  const version = m[2];
  const key = `${name}@${version}`;
  if (seen.has(key)) continue;
  seen.add(key);

  if (BANNED.includes(name)) failures.push(`Forbidden dependency present: ${key}`);

  if (name === 'mathjs') {
    const parts = version.split('.').map((n) => parseInt(n, 10));
    const below =
      parts[0] < MATHJS_FLOOR[0] ||
      (parts[0] === MATHJS_FLOOR[0] && parts[1] < MATHJS_FLOOR[1]) ||
      (parts[0] === MATHJS_FLOOR[0] && parts[1] === MATHJS_FLOOR[1] && parts[2] < MATHJS_FLOOR[2]);
    if (below) failures.push(`mathjs ${version} is below the security floor ${MATHJS_FLOOR.join('.')} (CVE policy)`);
  }
}

if (failures.length) {
  console.error('Forbidden-dependency policy violated:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('Forbidden-dependency policy OK: no expr-eval/expr-eval-fork/b1-service-layer; mathjs >= 15.2.0.');

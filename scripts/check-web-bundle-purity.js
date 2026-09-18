#!/usr/bin/env node
/**
 * Mechanical enforcement of the invariant documented at the top of
 * packages/core/index.js: the browser bundle must never reference
 * node:crypto (or other Node-only built-ins). Run after `pnpm --filter
 * @anansikey/web run build`, before the dist/index.html artifact ships.
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const distPath = path.join(__dir, '..', 'packages', 'web', 'dist', 'index.html');

const FORBIDDEN_PATTERNS = [
  /\bfrom\s*["']node:(crypto|https?|fs|child_process)["']/,
  /\brequire\(\s*["']node:(crypto|https?|fs|child_process)["']\s*\)/,
  /\brequire\(\s*["'](crypto|https?|child_process)["']\s*\)/,
];

if (!existsSync(distPath)) {
  console.error('\x1b[31m✗ dist/index.html not found — run the web build first\x1b[0m');
  process.exit(1);
}

const bundle = readFileSync(distPath, 'utf8');
const found = FORBIDDEN_PATTERNS.filter(re => re.test(bundle)).map(re => re.source);

if (found.length > 0) {
  console.error('\x1b[31m✗ Web bundle purity check FAILED\x1b[0m');
  console.error('  Forbidden Node-only import pattern(s) matched:', found.join(' | '));
  console.error('  A node-only provider (providers/*.node.js) leaked into the browser bundle.');
  console.error('  Check that packages/web/src/entry.js imports from the package root');
  console.error('  ("@anansikey/core") and that build.js uses platform: "browser".');
  process.exit(1);
}

console.log('\x1b[32m✓ Web bundle purity check passed — no Node-only references found\x1b[0m');
process.exit(0);

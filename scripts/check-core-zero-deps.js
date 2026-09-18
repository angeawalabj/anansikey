#!/usr/bin/env node
/**
 * check-core-zero-deps.js
 *
 * Enforces DEPENDENCIES.md: packages/core must declare zero runtime
 * dependencies. This is the manifest-level check; scripts/sast.js is the
 * source-level check (NO_EXTERNAL_NPM rule). Both must pass.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const pkgPath = path.join(__dir, '..', 'packages', 'core', 'package.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const deps = pkg.dependencies ?? {};
const depCount = Object.keys(deps).length;

if (depCount > 0) {
  console.error(
    `\x1b[31m✗ packages/core/package.json declares ${depCount} dependency(ies): ` +
    `${Object.keys(deps).join(', ')}\x1b[0m`
  );
  console.error(
    '  core must have zero runtime dependencies — see DEPENDENCIES.md.\n' +
    '  If this is intentional, update DEPENDENCIES.md and this script together.'
  );
  process.exit(1);
}

console.log('\x1b[32m✓ packages/core has zero declared dependencies\x1b[0m');
process.exit(0);

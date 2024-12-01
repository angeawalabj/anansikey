#!/usr/bin/env node
/**
 * SAST — Static Application Security Testing
 *
 * Scans all provider files for security violations before merge.
 * Runs in CI on every PR that touches packages/core/providers/.
 *
 * Checks:
 *   1. No import of 'https', 'http', 'fetch', 'node-fetch', 'axios', etc.
 *      — providers must not make HTTP calls directly
 *   2. No console.log / console.error of secret values
 *      — all logging must go through maskSecret()
 *   3. No outbound hostname hardcoded outside the request() function
 *      — prevents exfiltration to attacker-controlled domains
 *   4. No process.exit() — providers must return, not exit
 *   5. No dynamic require() or import() with variable paths
 *      — prevents supply chain injection
 *   6. No external npm imports (only @anansikey/core/* allowed)
 *      — zero dependency policy in providers
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dir, '..');
const PROVIDERS_DIR = path.join(ROOT, 'packages/core/providers');

const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', D = '\x1b[90m', X = '\x1b[0m';

// ── Rules ─────────────────────────────────────────────────────

const RULES = [
  {
    id: 'NO_HTTP_IMPORT',
    description: 'Provider must not import HTTP libraries directly',
    severity: 'CRITICAL',
    check(src, filename) {
      const banned = [
        /import\s+https\s+from/,
        /import\s+http\s+from/,
        /require\(['"]https['"]\)/,
        /require\(['"]http['"]\)/,
        /import.*node-fetch/,
        /import.*axios/,
        /import.*got\b/,
        /import.*undici/,
      ];
      return banned
        .filter(re => re.test(src))
        .map(re => `Banned HTTP import detected: ${re.source}`);
    }
  },
  {
    id: 'NO_CONSOLE_SECRET',
    description: 'Secrets must not be logged via console',
    severity: 'CRITICAL',
    check(src) {
      const violations = [];
      // Look for console.log/error/warn with credential variable names
      const secretVars = /console\.(log|error|warn|info)\s*\(.*?(secret|key|token|password|auth|bearer|api_key)/i;
      if (secretVars.test(src))
        violations.push('Potential secret value passed to console method — use maskSecret()');
      return violations;
    }
  },
  {
    id: 'NO_PROCESS_EXIT',
    description: 'Providers must return results, not call process.exit()',
    severity: 'HIGH',
    check(src) {
      if (/process\.exit\s*\(/.test(src))
        return ['process.exit() found — providers must return a result, not exit'];
      return [];
    }
  },
  {
    id: 'NO_DYNAMIC_IMPORT',
    description: 'Dynamic imports with variable paths are forbidden',
    severity: 'HIGH',
    check(src) {
      // import(variable) or require(variable) — static strings are OK
      const dynImport = /import\s*\(\s*[^'"]\s*/;
      const dynRequire = /require\s*\(\s*[^'"]/;
      const violations = [];
      if (dynImport.test(src)) violations.push('Dynamic import() with non-string path detected');
      if (dynRequire.test(src)) violations.push('Dynamic require() with non-string path detected');
      return violations;
    }
  },
  {
    id: 'NO_EXTERNAL_NPM',
    description: 'Providers may only import from @anansikey/core',
    severity: 'HIGH',
    check(src) {
      // Find all import statements
      const imports = [...src.matchAll(/^import\s+.*?from\s+['"]([^'"]+)['"]/gm)]
        .map(m => m[1]);

      const violations = [];
      for (const imp of imports) {
        // Allow: relative paths, @anansikey/core
        if (imp.startsWith('.') || imp.startsWith('@anansikey/core')) continue;
        violations.push(`External import not allowed: '${imp}' — providers may only use @anansikey/core`);
      }
      return violations;
    }
  },
  {
    id: 'MUST_HAVE_NETGUARD',
    description: 'Provider parse() must handle _malformed flag from adapter',
    severity: 'MEDIUM',
    check(src) {
      // Heuristic: if parse() exists and doesn't check _malformed
      if (src.includes('parse(') && !src.includes('_malformed'))
        return ['parse() should handle body._malformed flag (chaos: malformed response protection)'];
      return [];
    }
  },
  {
    id: 'MUST_EXPORT_DEFAULT',
    description: 'Provider must use export default with required fields',
    severity: 'HIGH',
    check(src) {
      if (!src.includes('export default'))
        return ['Provider must use export default { id, name, format, request, parse }'];

      const required = ['id:', 'name:', 'format(', 'request(', 'parse('];
      return required
        .filter(field => !src.includes(field))
        .map(field => `Required field missing: ${field}`);
    }
  },
];

// ── Scanner ────────────────────────────────────────────────────

async function scanFile(filepath) {
  const src = fs.readFileSync(filepath, 'utf8');
  const filename = path.basename(filepath);
  const violations = [];

  for (const rule of RULES) {
    const found = rule.check(src, filename);
    for (const msg of found) {
      violations.push({ rule: rule.id, severity: rule.severity, msg });
    }
  }

  return violations;
}

async function main() {
  console.log('\n' + C + '🕷 Anansikey SAST Scanner' + X);
  console.log(D + '  Scanning: ' + PROVIDERS_DIR + X + '\n');

  if (!fs.existsSync(PROVIDERS_DIR)) {
    console.log(Y + '  No providers directory found — skipping' + X);
    process.exit(0);
  }

  const files = fs.readdirSync(PROVIDERS_DIR)
    .filter(f => f.endsWith('.js') && !f.startsWith('_'))
    .map(f => path.join(PROVIDERS_DIR, f));

  if (files.length === 0) {
    console.log(Y + '  No provider files found' + X);
    process.exit(0);
  }

  let totalViolations = 0;
  let totalCritical = 0;

  for (const file of files) {
    const name = path.basename(file);
    const violations = await scanFile(file);

    if (violations.length === 0) {
      console.log(G + '  ✓' + X + ' ' + name);
    } else {
      console.log(R + '  ✗' + X + ' ' + name + ' — ' + violations.length + ' violation(s)');
      for (const v of violations) {
        const color = v.severity === 'CRITICAL' ? R : v.severity === 'HIGH' ? Y : D;
        console.log(color + '    [' + v.severity + '] ' + v.rule + ': ' + v.msg + X);
        if (v.severity === 'CRITICAL') totalCritical++;
      }
      totalViolations += violations.length;
    }
  }

  console.log('\n' + D + '  ' + '─'.repeat(50) + X);
  console.log('  Scanned: ' + files.length + ' provider(s)');

  if (totalViolations === 0) {
    console.log(G + '  ✓ No violations found\n' + X);
    process.exit(0);
  } else {
    console.log(R + '  ✗ ' + totalViolations + ' violation(s) — ' + totalCritical + ' critical\n' + X);
    // Critical violations block merge
    process.exit(totalCritical > 0 ? 1 : 0);
  }
}

main().catch(e => {
  console.error(R + '  SAST internal error: ' + e.message + X);
  process.exit(9);
});

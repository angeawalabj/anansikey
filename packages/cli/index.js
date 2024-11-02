#!/usr/bin/env node
/**
 * @anansikey/cli — v2
 *
 * Commands:
 *   check   <service> [--field=value ...] [--silent] [--no-color] [--json]
 *   scan    [file]    [--from-vault=...] [--from-doppler] [--from-aws=...] [--from-infisical] [--silent] [--json]
 *   fetch   <source>  [path/flags] [--scan]
 *   list
 *   scaffold --name=ServiceName
 *   help
 *
 * Exit codes (semantic, not binary):
 *   0 = all valid
 *   1 = auth failed (rotation required)
 *   2 = network error (retry)
 *   3 = format error (dev bug)
 *   4 = rate limited (backoff)
 *   5 = warning only
 *   9 = internal error
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, basename } from 'path';

import {
  PROVIDERS, PROVIDERS_BY_ID, detectServices, runProvider,
  ExitCode, exitCodeFor, ResultType, ErrorCode,
} from '../core/index.js';
import { request } from '../core/adapters/node.js';
import { maskSecret, sanitizeCreds } from '../core/results/mask.js';
import { netErr } from '../core/results/index.js';

// ── Secret manager imports ────────────────────────────────────
import { resolveSecretSource } from './secret-managers/index.js';

// ── Rate limiting [P7] ────────────────────────────────────────
const SCAN_DELAY_MS = 500;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Colour helpers ────────────────────────────────────────────
let NO_COLOR = process.env.NO_COLOR || process.argv.includes('--no-color');
let SILENT    = process.argv.includes('--silent');
let JSON_OUT  = process.argv.includes('--json');

const c = (color, text) => {
  if (NO_COLOR) return text;
  const CODES = { red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
    cyan:'\x1b[36m', gray:'\x1b[90m', bold:'\x1b[1m', reset:'\x1b[0m' };
  return (CODES[color] ?? '') + text + CODES.reset;
};

const log  = (...a) => !SILENT && console.log(...a);
const err  = (...a) => console.error(...a);   // always prints (even --silent)

// ── Output helpers ────────────────────────────────────────────
function printResult(providerName, result) {
  if (JSON_OUT) return; // JSON mode: collected and printed at end

  if (result.type === ResultType.SUCCESS) {
    log(`  ${c('green', '✓')} ${c('bold', providerName.padEnd(22))} ${result.msg}`);
    if (result.detail) log(`  ${c('gray', '  ' + result.detail.replace(/\n/g, '\n    '))}`);
  } else if (result.type === ResultType.WARN) {
    log(`  ${c('yellow', '⚠')} ${c('bold', providerName.padEnd(22))} ${result.msg}`);
    if (result.fix) log(`  ${c('cyan', '  💡 ' + result.fix.split('\n')[0])}`);
  } else {
    log(`  ${c('red', '✗')} ${c('bold', providerName.padEnd(22))} [${c('yellow', result.code)}] ${result.msg}`);
    if (result.fix) log(`  ${c('cyan', '  💡 ' + result.fix.split('\n')[0])}`);
  }
}

function printSeparator() {
  log(c('gray', '  ' + '─'.repeat(58)));
}

function printHeader() {
  log(`\n  ${c('cyan', '🕷 Anansikey')} ${c('gray', 'v2.0.0 — Outsmart API Key Errors')}\n`);
}

// ── Parse .env file ───────────────────────────────────────────
function parseEnvFile(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) {
    err(c('red', `\n  ✗ File not found: ${abs}`));
    process.exit(ExitCode.FORMAT_ERROR);
  }
  const vars = {};
  const lines = readFileSync(abs, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // Strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key) vars[key] = val;
  }
  return vars;
}

// ── Parse inline CLI args: --field=value → { field: value } ──
function parseInlineArgs(args) {
  const creds = {};
  for (const a of args) {
    if (a.startsWith('--') && a.includes('=')) {
      const [k, ...rest] = a.slice(2).split('=');
      if (!['silent','no-color','json'].includes(k))
        creds[k.replace(/-/g, '_')] = rest.join('=');
    }
  }
  return creds;
}

// ── Commands ──────────────────────────────────────────────────

async function cmdCheck(args) {
  const serviceId = args[0];
  if (!serviceId) {
    err(c('red', '\n  ✗ Usage: anansikey check <service> [--field=value ...]\n'));
    err(c('gray', '  Run anansikey list to see available services\n'));
    process.exit(ExitCode.FORMAT_ERROR);
  }

  const provider = PROVIDERS_BY_ID[serviceId.toLowerCase()];
  if (!provider) {
    err(c('red', `\n  ✗ Unknown service: "${serviceId}"`));
    err(c('gray', '  Run anansikey list to see available services\n'));
    process.exit(ExitCode.FORMAT_ERROR);
  }

  printHeader();

  // Build creds: inline args override env vars
  const envCreds = {};
  for (const envVar of provider.env_vars) {
    if (process.env[envVar]) {
      // Map env var → field name via detectServices logic
      const detected = detectServices({ [envVar]: process.env[envVar] });
      const match = detected.find(d => d.provider.id === provider.id);
      if (match) Object.assign(envCreds, match.creds);
    }
  }
  const inlineCreds = parseInlineArgs(args.slice(1));
  const creds = { ...envCreds, ...inlineCreds };

  log(`  ${c('gray', `→ Testing ${provider.icon} ${provider.name}...`)}\n`);

  const result = await runProvider(provider, creds, request);
  printResult(provider.name, result);
  log();

  if (JSON_OUT) console.log(JSON.stringify({ provider: provider.id, ...result }, null, 2));

  log(c('gray', '  🔒 [P1] No credentials transmitted to Anansikey servers.\n'));
  process.exit(exitCodeFor(result));
}

async function cmdScan(args) {
  // Strip all source/flag args to find the file path
  const SOURCE_FLAGS = ['--from-vault','--from-aws','--from-doppler','--from-infisical',
    '--from-1password','--from-json','--project=','--env=','--environment=','--path=',
    '--host=','--token=','--workspace=','--vault=','--item=','--region=','--config=',
    '--scan','--silent','--no-color','--json'];

  const filteredArgs = args.filter(a =>
    !SOURCE_FLAGS.some(f => a === f || a.startsWith(f)));

  printHeader();

  // Check for secret manager source
  const secretSource = await resolveSecretSource(args);
  let vars, sourceLabel;

  if (secretSource) {
    vars        = secretSource.vars;
    sourceLabel = secretSource.sourceLabel;
    log(`  ${c('cyan', '→')} Scanning ${c('bold', sourceLabel)}...\n`);
  } else {
    const envFile = filteredArgs[0] || '.env';
    log(`  ${c('cyan', '→')} Scanning ${c('bold', envFile)}...\n`);
    vars = parseEnvFile(envFile);
  }

  const detected = detectServices(vars);

  if (detected.length === 0) {
    log(c('yellow', '  ⚠ No recognized credential keys found.'));
    log(c('gray',   '  Ensure keys use standard names: STRIPE_SECRET_KEY, OPENAI_API_KEY, etc.\n'));
    process.exit(ExitCode.OK);
  }

  log(c('gray', `  Found ${detected.length} service(s) to validate\n`));
  printSeparator();
  log();

  let worstExit = ExitCode.OK;
  const jsonResults = [];

  for (let i = 0; i < detected.length; i++) {
    const { provider, creds } = detected[i];
    const result = await runProvider(provider, creds, request);
    printResult(provider.name, result);
    jsonResults.push({ provider: provider.id, ...result });

    const code = exitCodeFor(result);
    if (code !== ExitCode.WARNING && code > worstExit) worstExit = code;
    if (i < detected.length - 1) await sleep(SCAN_DELAY_MS);
  }

  log();
  printSeparator();

  const passed  = jsonResults.filter(r => r.type === ResultType.SUCCESS).length;
  const failed  = jsonResults.filter(r => r.type === ResultType.ERROR).length;
  const warned  = jsonResults.filter(r => r.type === ResultType.WARN).length;

  log(`\n  ${c('green', `✓ ${passed} passed`)}  ${c('red', `✗ ${failed} failed`)}  ${c('yellow', `⚠ ${warned} warned`)}`);
  log(c('gray', '\n  🔒 [P1] No credentials transmitted to Anansikey servers.\n'));

  if (JSON_OUT) console.log(JSON.stringify(jsonResults, null, 2));

  process.exit(worstExit);
}

function cmdList() {
  printHeader();
  const byCategory = {};
  for (const p of PROVIDERS) {
    if (!byCategory[p.category]) byCategory[p.category] = [];
    byCategory[p.category].push(p);
  }
  for (const [cat, providers] of Object.entries(byCategory)) {
    log(`  ${c('gray', cat)}`);
    for (const p of providers) {
      const fields = p.fields.map(f => `--${f.name}=`).join(' ');
      const envs   = p.env_vars.slice(0, 2).join(', ');
      log(`    ${p.icon}  ${c('cyan', p.id.padEnd(18))} ${c('gray', fields)}`);
      log(`       ${c('gray', 'env: ' + envs)}`);
    }
    log();
  }
}

function cmdScaffold(args) {
  const nameArg = args.find(a => a.startsWith('--name='));
  if (!nameArg) {
    err(c('red', '\n  ✗ Usage: anansikey scaffold --name=ServiceName\n'));
    process.exit(ExitCode.FORMAT_ERROR);
  }
  const name = nameArg.replace('--name=', '');
  const id   = name.toLowerCase().replace(/[^a-z0-9]/g, '_');

  const template = `/**
 * Provider: ${name}
 * Category: TODO — Payments | Email | SMS | AI / ML | Database | Auth | Cloud | ...
 * Contributor: @your-github-username
 *
 * RESEARCH CHECKLIST (fill before writing any code):
 *   [ ] Endpoint URL for read-only account check
 *   [ ] HTTP method (must be GET or read-only POST)
 *   [ ] Auth header format
 *   [ ] Success response shape
 *   [ ] Error response codes (401, 403, 404, 429, 5xx)
 *   [ ] Key format (prefix, length, charset)
 *   [ ] Environment variable names
 *
 * SECURITY PRINCIPLES (non-negotiable):
 *   [P2] Only GET endpoints — no create, modify or delete
 *   [P6] Use maskSecret() for any key in output
 *   [P8] User-Agent set automatically — do NOT override
 */

import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id:       '${id}',
  name:     '${name}',
  icon:     '🔑',        // TODO — pick an emoji
  category: 'TODO',      // TODO — see list above
  docs:     'https://TODO',

  fields: [
    { name: 'api_key', label: 'API Key', placeholder: 'TODO prefix...' },
    // Add more fields if needed (e.g. account_id, domain, region)
  ],

  env_vars: ['${name.toUpperCase()}_API_KEY'],  // TODO — standard names

  // ── format() ────────────────────────────────────────────────
  // Pure function. No network. Called before HTTP request.
  // Return null if valid, or fail()/warn() if not.
  format({ api_key }) {
    const k = api_key?.trim() ?? '';

    if (!k) return fail(ErrorCode.MISSING_KEY,
      'API key is required',
      'Find it at TODO → Settings → API Keys');

    // TODO: add prefix check
    // if (!k.startsWith('sk_')) return fail(ErrorCode.FORMAT_ERROR, ...)

    // TODO: add length check
    // if (k.length !== 40) return fail(ErrorCode.FORMAT_ERROR, ...)

    return null; // valid
  },

  // ── request() ───────────────────────────────────────────────
  // Returns a descriptor object. Never makes HTTP call itself.
  request({ api_key }) {
    return {
      hostname: 'api.TODO.com',        // TODO
      path:     '/v1/account',         // TODO — read-only endpoint
      headers:  { 'Authorization': \`Bearer \${api_key.trim()}\` }, // TODO — auth format
    };
  },

  // ── parse() ─────────────────────────────────────────────────
  // Interprets HTTP response. Pure function.
  // Map EVERY status code to a human message [P3].
  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);

    if (status === 200)
      return ok(
        \`${name} connected — \${body.TODO ?? 'account verified'}\`,
        \`Key: \${maskSecret(creds?.api_key)}\`
      );

    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.error?.message ?? 'Invalid API key',
      'Regenerate at TODO → Settings → API Keys');

    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.error?.message ?? 'Insufficient permissions',
      'Check key permissions at TODO → Settings → API Keys');

    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Rate limit reached', 'Wait a moment and try again');

    if (status >= 500) return fail(ErrorCode.API_ERROR,
      \`${name} API unavailable (HTTP \${status})\`,
      'TODO — link to status page');

    return fail(ErrorCode.API_ERROR,
      body.error?.message ?? \`Unexpected response: HTTP \${status}\`,
      'TODO — link to API docs');
  },
};
`;

  const { mkdirSync, writeFileSync } = await import('fs').then(m => m);
  mkdirSync('./providers', { recursive: true });
  writeFileSync(`./providers/${id}.js`, template);

  log(c('green', `\n  ✓ Scaffold created: ./providers/${id}.js`));
  log(c('gray', `\n  Next steps:`));
  log(c('cyan',  `    1. Fill in all TODO items in providers/${id}.js`));
  log(c('cyan',  `    2. Add to packages/core/index.js imports`));
  log(c('cyan',  `    3. Add test creds to packages/chaos/runner.js`));
  log(c('cyan',  `    4. Run: node packages/chaos/runner.js`));
  log(c('cyan',  `    5. Submit PR with the checklist filled\n`));
}

function cmdHelp() {
  log(`
  ${c('bold', '🕷 Anansikey v2.0.0')} — ${c('gray', 'Outsmart API Key Errors')}

  ${c('bold', 'Commands')}

  ${c('cyan', 'check')}  <service> [--field=value ...] [--silent] [--no-color] [--json]
         Validate a single credential. Reads env vars automatically.
         ${c('gray', 'anansikey check stripe --secret_key=sk_test_xxx')}
         ${c('gray', 'STRIPE_SECRET_KEY=sk_test_xxx anansikey check stripe')}

  ${c('cyan', 'scan')}   [file] [--from-vault=...] [--from-doppler] [--from-aws=...] [--from-infisical]
         Validate all credentials in a .env file or secret manager.
         Exits 1 on auth failure, 2 on network error, 3 on format error.
         ${c('gray', 'anansikey scan .env.production')}
         ${c('gray', 'anansikey scan --from-vault=vault://secret/data/myapp')}
         ${c('gray', 'anansikey scan --from-doppler --project=myapp --config=production')}
         ${c('gray', 'anansikey scan --from-infisical --project=abc123 --env=production')}

  ${c('cyan', 'fetch')}  <vault|aws|doppler|infisical|1password> [path] [--scan]
         Pull secrets from a manager and display (masked). Add --scan to validate.
         ${c('gray', 'anansikey fetch vault vault://secret/data/myapp --scan')}

  ${c('cyan', 'list')}   Show all supported services with fields and env var names.

  ${c('cyan', 'scaffold')} --name=ServiceName   Generate a new provider template.

  ${c('bold', 'Secret Manager Flags')}

  ${c('cyan', '--from-vault=vault://path')}      HashiCorp Vault KV v1/v2 · needs VAULT_ADDR + VAULT_TOKEN
  ${c('cyan', '--from-aws=arn:...')}             AWS Secrets Manager · needs AWS credentials
  ${c('cyan', '--from-doppler')}                 Doppler · needs DOPPLER_TOKEN
  ${c('cyan', '--from-infisical')}               Infisical cloud or self-hosted · needs INFISICAL_TOKEN + --project
  ${c('cyan', '--from-1password')}               1Password CLI · needs op signin

  ${c('bold', 'Exit Codes')}

  0 = all valid   1 = auth failed   2 = network error
  3 = format error   4 = rate limited   5 = warning only   9 = internal error

  ${c('bold', 'CI/CD (GitHub Actions)')}

  ${c('gray', '- name: Validate credentials')}
  ${c('gray', '  env:')}
  ${c('gray', '    VAULT_TOKEN: ${{ secrets.VAULT_TOKEN }}')}
  ${c('gray', '    VAULT_ADDR:  ${{ secrets.VAULT_ADDR }}')}
  ${c('gray', '  run: npx anansikey scan --from-vault=vault://secret/data/prod --silent')}
`);
}

// ── Main ──────────────────────────────────────────────────────
const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'check':    await cmdCheck(args);         break;
  case 'scan':     await cmdScan(args);          break;
  case 'list':     cmdList();                    break;
  case 'scaffold': await cmdScaffold(args);      break;
  case 'fetch':    // TODO: cmdFetch in next step
    log(c('yellow', '\n  fetch command coming in next build step\n'));
    break;
  case 'help':
  case '--help':
  case '-h':
  default:
    cmdHelp();
}

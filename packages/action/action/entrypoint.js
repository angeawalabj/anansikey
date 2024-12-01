/**
 * Anansikey GitHub Action — entrypoint.js
 *
 * Runs as node20 directly — no Docker, no shell wrapper.
 * Imports @anansikey/core (same registry as CLI and VS Code).
 * Zero duplication — one provider definition serves all runtimes.
 *
 * Uses @actions/core for GitHub-native input/output.
 * Falls back gracefully if @actions/core is not available (local testing).
 */

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));

// ── GitHub Actions SDK ─────────────────────────────────────────
// Graceful fallback for local testing without the SDK
let core;
try {
  const require = createRequire(import.meta.url);
  core = require('@actions/core');
} catch {
  // Local testing mode — mock @actions/core
  core = {
    getInput:     (name) => process.env[`INPUT_${name.toUpperCase().replace(/-/g,'_')}`] ?? '',
    setOutput:    (name, val) => console.log(`::set-output name=${name}::${val}`),
    setFailed:    (msg) => { console.error(`::error::${msg}`); process.exit(1); },
    info:         console.log,
    warning:      (msg) => console.log(`::warning::${msg}`),
    error:        (msg) => console.error(`::error::${msg}`),
    startGroup:   (name) => console.log(`\n▶ ${name}`),
    endGroup:     () => console.log(''),
    summary: {
      addHeading: () => ({ addTable: () => ({ addLink: () => ({ write: async () => {} }) }) }),
    },
  };
}

// ── Import @anansikey/core ────────────────────────────────────
const CORE_PATH = path.resolve(__dir, '../core');
const {
  PROVIDERS, detectServices, runProvider,
  ResultType, ExitCode, exitCodeFor,
} = await import(path.join(CORE_PATH, 'index.js'));

const { request: nodeRequest } = await import(path.join(CORE_PATH, 'adapters/node.js'));
const { maskSecret }           = await import(path.join(CORE_PATH, 'results/mask.js'));

// ── Secret manager fetchers ───────────────────────────────────
const SM_PATH = path.resolve(__dir, '../cli/secret-managers');
const { resolveSecretSource } = await import(path.join(SM_PATH, 'index.js'));

// ── Helpers ───────────────────────────────────────────────────
function parseEnvFile(filePath) {
  const { readFileSync, existsSync } = await import('fs');
  if (!existsSync(filePath)) {
    core.setFailed(`env_file not found: ${filePath}`);
    process.exit(ExitCode.FORMAT_ERROR);
  }
  const vars = {};
  for (const raw of readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let   val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key) vars[key] = val;
  }
  return vars;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Main ──────────────────────────────────────────────────────
async function run() {
  core.startGroup('🕷 Anansikey — API Credential Validation');

  // Read inputs
  const source        = core.getInput('source');
  const envFile       = core.getInput('env_file') || '.env';
  const failOnWarning = core.getInput('fail_on_warning') === 'true';
  const jsonOutput    = core.getInput('json_output') === 'true';

  // Build args array for resolveSecretSource (mirrors CLI flag format)
  const args = [];

  if (source === 'vault') {
    const addr  = core.getInput('vault_addr')  || process.env.VAULT_ADDR  || '';
    const token = core.getInput('vault_token') || process.env.VAULT_TOKEN || '';
    const vpath = core.getInput('vault_path');
    if (addr)  process.env.VAULT_ADDR  = addr;
    if (token) process.env.VAULT_TOKEN = token;
    args.push(`--from-vault=${vpath}`);
  }

  else if (source === 'aws') {
    const arn    = core.getInput('aws_secret_arn');
    const region = core.getInput('aws_region') || process.env.AWS_REGION || 'us-east-1';
    process.env.AWS_REGION = region;
    args.push(`--from-aws=${arn}`, `--region=${region}`);
  }

  else if (source === 'doppler') {
    const token   = core.getInput('doppler_token')   || process.env.DOPPLER_TOKEN || '';
    const project = core.getInput('doppler_project') || '';
    const config  = core.getInput('doppler_config')  || '';
    if (token)   process.env.DOPPLER_TOKEN   = token;
    if (project) process.env.DOPPLER_PROJECT = project;
    if (config)  process.env.DOPPLER_CONFIG  = config;
    args.push('--from-doppler',
      ...(project ? [`--project=${project}`] : []),
      ...(config  ? [`--config=${config}`]   : []));
  }

  else if (source === 'infisical') {
    const token   = core.getInput('infisical_token')       || process.env.INFISICAL_TOKEN || '';
    const projId  = core.getInput('infisical_project_id')  || process.env.INFISICAL_PROJECT_ID || '';
    const env     = core.getInput('infisical_environment') || 'production';
    const host    = core.getInput('infisical_host')        || 'https://app.infisical.com';
    if (token)  process.env.INFISICAL_TOKEN       = token;
    if (projId) process.env.INFISICAL_PROJECT_ID  = projId;
    process.env.INFISICAL_ENVIRONMENT = env;
    process.env.INFISICAL_HOST        = host;
    args.push('--from-infisical', `--project=${projId}`, `--env=${env}`, `--host=${host}`);
  }

  // Resolve secret source or fall back to .env file
  let vars;
  const secretSource = source ? await resolveSecretSource(args) : null;

  if (secretSource) {
    vars = secretSource.vars;
    core.info(`Source: ${secretSource.sourceLabel}`);
  } else {
    core.info(`Source: ${envFile}`);
    vars = parseEnvFile(envFile);
  }

  // Detect services
  const detected = detectServices(vars);

  if (detected.length === 0) {
    core.warning('No recognized credential keys found.');
    core.warning('Ensure keys use standard names: STRIPE_SECRET_KEY, OPENAI_API_KEY, etc.');
    core.setOutput('passed', '0');
    core.setOutput('failed', '0');
    core.setOutput('warned',  '0');
    core.setOutput('exit_code', '0');
    core.endGroup();
    return;
  }

  core.info(`Found ${detected.length} service(s) to validate\n`);

  // Validate each service
  const results     = [];
  let   worstExit   = ExitCode.OK;

  for (let i = 0; i < detected.length; i++) {
    const { provider, creds } = detected[i];

    core.info(`Testing ${provider.icon} ${provider.name}...`);

    const result = await runProvider(provider, creds, nodeRequest);
    results.push({ provider: provider.id, name: provider.name, ...result });

    // Log result in GitHub Actions format
    const maskedKey = maskSecret(Object.values(creds)[0] ?? '');

    if (result.type === ResultType.SUCCESS) {
      core.info(`  ✓ ${provider.name}: ${result.msg}`);
    } else if (result.type === ResultType.WARN) {
      core.warning(`${provider.name}: ${result.msg}${result.fix ? ` — ${result.fix.split('\n')[0]}` : ''}`);
    } else {
      core.error(`${provider.name}: [${result.code}] ${result.msg}${result.fix ? ` — ${result.fix.split('\n')[0]}` : ''}`);
    }

    // Determine worst non-warning exit code
  // WARNING (5) is non-blocking — a separate fail_on_warning input handles it
  if (code !== ExitCode.WARNING && code > worstExit) worstExit = code;

    // [P7] Rate respect between tests
    if (i < detected.length - 1) await sleep(500);
  }

  core.endGroup();

  // Compute summary stats
  const passed = results.filter(r => r.type === ResultType.SUCCESS).length;
  const failed = results.filter(r => r.type === ResultType.ERROR).length;
  const warned  = results.filter(r => r.type === ResultType.WARN).length;

  // Set outputs
  core.setOutput('passed',    String(passed));
  core.setOutput('failed',    String(failed));
  core.setOutput('warned',    String(warned));
  core.setOutput('exit_code', String(worstExit));
  if (jsonOutput) core.setOutput('results', JSON.stringify(results));

  // GitHub Actions job summary
  try {
    await core.summary
      .addHeading('🕷 Anansikey Validation Results')
      .addTable([
        [
          { data: 'Service', header: true },
          { data: 'Status', header: true },
          { data: 'Message', header: true },
        ],
        ...results.map(r => [
          r.name,
          r.type === ResultType.SUCCESS ? '✓ Valid'
            : r.type === ResultType.WARN ? '⚠ Warning' : '✗ Failed',
          r.msg,
        ]),
        [
          { data: 'Total', header: true },
          { data: `✓ ${passed}  ✗ ${failed}  ⚠ ${warned}`, header: true },
          { data: '[P1] No credentials transmitted to Anansikey servers', header: false },
        ],
      ])
      .addLink('Anansikey documentation', 'https://anansikey.dev')
      .write();
  } catch {
    // Summary API may not be available in all environments
  }

  // Determine final exit
  if (failed > 0) {
    core.setFailed(`${failed} credential(s) failed validation. Exit code: ${worstExit}`);
    process.exit(worstExit);
  }

  if (failOnWarning && warned > 0) {
    core.setFailed(`${warned} credential(s) have warnings and fail_on_warning=true`);
    process.exit(ExitCode.WARNING);
  }

  core.info(`\n✓ All ${passed} credential(s) valid.`);
  core.info(`[P1] No credentials were transmitted to Anansikey servers.`);
}

run().catch(e => {
  core.setFailed(`Anansikey internal error: ${e.message}`);
  process.exit(ExitCode.INTERNAL);
});

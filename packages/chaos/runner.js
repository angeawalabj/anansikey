/**
 * @anansikey/chaos — Full suite runner
 *
 * Runs the complete chaos suite against every provider in the registry.
 * Every provider must survive every failure mode without throwing.
 *
 * Usage: node packages/chaos/runner.js
 * CI:    exits 1 if any provider crashes on any scenario
 */

import { PROVIDERS } from '../core/index.js';
import { fullChaos, summary } from './harness/index.js';

const C = '\x1b[36m', D = '\x1b[90m', X = '\x1b[0m';

// ── Valid test credentials for each provider ──────────────────
// These are structurally valid but fake — used to bypass format()
// and reach the network simulation layer.
const VALID_CREDS = {
  stripe:         { secret_key:      'sk_test_' + 'a'.repeat(40) },
  paystack:       { secret_key:      'sk_test_' + 'a'.repeat(40) },
  stripe_webhook: { webhook_secret:  'whsec_' + 'a'.repeat(30) },
  sendgrid:       { api_key:         'SG.test.test123456789012345' },
  mailgun:        { api_key:         'key-' + 'a'.repeat(32), domain: 'mg.test.com' },
  resend:         { api_key:         're_test_' + 'a'.repeat(20) },
  twilio:         { account_sid:     'AC' + 'a'.repeat(32), auth_token: 'a'.repeat(32) },
  vonage:         { api_key:         'a1b2c3d4', api_secret: 'Aa1'.repeat(5) + 'a' },
  openai:         { api_key:         'sk-' + 'a'.repeat(48) },
  pinecone:       { api_key:         'a'.repeat(36) },
  supabase:       { url: 'https://test.supabase.co', key: 'eyJ' + 'a'.repeat(100) },
  airtable:       { token:           'pat' + 'a'.repeat(20) },
  firebase:       { api_key: 'AIzaSy' + 'a'.repeat(33), project_id: 'my-project' },
  google_oauth:   { client_id: 'abc.apps.googleusercontent.com', access_token: 'ya29.' + 'a'.repeat(80) },
  apple:          { team_id: 'AAAAAAAAAA', key_id: 'BBBBBBBBBB', bundle_id: 'com.test.app' },
  linkedin:       { access_token:    'AQV' + 'a'.repeat(200) },
  facebook:       { access_token:    'EAA' + 'a'.repeat(100) },
  aws:            { access_key_id: 'AKIAIOSFODNN7EXAMPLE', secret_access_key: 'a'.repeat(40), region: 'us-east-1' },
  cloudinary:     { cloud_name: 'mycloud', api_key: '123456789', api_secret: 'a'.repeat(20) },
  shopify:        { shop: 'my-store', access_token: 'shpat_' + 'a'.repeat(32) },
  whatsapp:       { access_token: 'EAA' + 'a'.repeat(100), phone_number_id: '1234567890' },
  pusher:         { app_id: '123456', app_key: 'a'.repeat(10), app_secret: 'b'.repeat(10), cluster: 'eu' },
  github:         { token:           'ghp_' + 'a'.repeat(36) },
  notion:         { token:           'secret_' + 'a'.repeat(40) },
  vapid:          { public_key: 'B' + 'A'.repeat(86), private_key: 'a'.repeat(43) },
};

async function main() {
  console.log('\n' + C + '🕷 Anansikey — Full Chaos Suite' + X);
  console.log(D + '  ' + PROVIDERS.length + ' providers × 8 scenarios = ' +
    (PROVIDERS.length * 8) + ' chaos tests' + X);

  for (const provider of PROVIDERS) {
    const creds = VALID_CREDS[provider.id];
    if (!creds) {
      console.log('\x1b[33m  ⚠ No test creds for: ' + provider.id + X);
      continue;
    }
    await fullChaos(provider, creds);
  }

  const failures = summary();

  // Also run SAST
  console.log('\n' + C + '  Running SAST...' + X);
  const { execSync } = await import('child_process');
  try {
    execSync('node scripts/sast.js', {
      cwd: new URL('../../..', import.meta.url).pathname,
      stdio: 'inherit',
    });
  } catch {
    process.exit(1);
  }

  process.exit(failures > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('\x1b[31m  Chaos runner error:', e.message, '\x1b[0m');
  process.exit(9);
});

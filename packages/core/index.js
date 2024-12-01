/**
 * @anansikey/core — Provider Registry
 *
 * THE single source of truth.
 * CLI, web app, VS Code all import from here.
 * Adding a provider = adding one entry here + one file in providers/.
 *
 * No duplication. No drift. No sync issues.
 */

import stripe         from './providers/stripe.js';
import github         from './providers/github.js';
import openai         from './providers/openai.js';
import supabase       from './providers/supabase.js';
import firebase       from './providers/firebase.js';
import twilio         from './providers/twilio.js';

import { sendgrid, mailgun, resend }              from './providers/email.js';
import { cloudinary, airtable, notion, pinecone } from './providers/storage.js';
import { aws, shopify, whatsapp, pusher }         from './providers/cloud.js';
import {
  google_oauth, apple, linkedin, facebook,
  vonage, paystack, stripe_webhook, vapid,
} from './providers/auth.js';

// ── Registry ──────────────────────────────────────────────────
// Ordered by category for display in CLI `list` and web app grid.

export const PROVIDERS = [
  // Payments
  stripe, paystack, stripe_webhook,
  // Email
  sendgrid, mailgun, resend,
  // SMS / Calls
  twilio, vonage,
  // AI / ML
  openai, pinecone,
  // Database
  supabase, airtable,
  // Backend
  firebase,
  // Auth
  google_oauth, apple,
  // Auth / Social
  linkedin, facebook,
  // Cloud
  aws,
  // Media / Storage
  cloudinary,
  // E-Commerce
  shopify,
  // Messaging
  whatsapp,
  // Realtime
  pusher,
  // Dev Tools
  github,
  // Productivity
  notion,
  // Notifications
  vapid,
];

// ── Lookup map ────────────────────────────────────────────────
export const PROVIDERS_BY_ID = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p])
);

// ── Env var → provider map ────────────────────────────────────
// Used by scan() to auto-detect services from a flat {KEY: VALUE} object.
export const ENV_VAR_MAP = {};
for (const provider of PROVIDERS) {
  for (const envVar of provider.env_vars ?? []) {
    if (!ENV_VAR_MAP[envVar]) ENV_VAR_MAP[envVar] = [];
    ENV_VAR_MAP[envVar].push(provider);
  }
}

/**
 * Detect which providers match a set of env vars.
 * Returns an array of { provider, creds } ready for testing.
 *
 * @param {object} vars — flat { KEY: VALUE } from any source
 * @returns {Array<{ provider, creds }>}
 */
export function detectServices(vars) {
  const detected = new Map(); // provider.id → { provider, creds }

  for (const [envKey, value] of Object.entries(vars)) {
    const providers = ENV_VAR_MAP[envKey];
    if (!providers) continue;

    for (const provider of providers) {
      if (!detected.has(provider.id)) {
        detected.set(provider.id, { provider, creds: {} });
      }
      // Map env var to credential field name
      const field = envVarToField(envKey, provider);
      if (field) detected.get(provider.id).creds[field] = value;
    }
  }

  // Only return providers where all required fields are present
  return [...detected.values()].filter(({ provider, creds }) =>
    provider.fields.every(f => creds[f.name] != null)
  );
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Map an env var name to the credential field name for a provider.
 * e.g. STRIPE_SECRET_KEY → secret_key  (for stripe provider)
 *      TWILIO_ACCOUNT_SID → account_sid (for twilio provider)
 */
function envVarToField(envKey, provider) {
  // Strategy 1: exact match on field name upper-cased
  for (const field of provider.fields) {
    const expected = `${provider.id.toUpperCase()}_${field.name.toUpperCase()}`;
    if (envKey === expected) return field.name;
  }

  // Strategy 2: field name appears in env key
  for (const field of provider.fields) {
    if (envKey.toLowerCase().includes(field.name.toLowerCase())) return field.name;
  }

  // Strategy 3: single-field providers — the env var IS the credential
  if (provider.fields.length === 1) return provider.fields[0].name;

  return null;
}

/**
 * Run a provider test using the correct runtime adapter.
 *
 * @param {object}   provider   — provider from registry
 * @param {object}   creds      — credential values
 * @param {function} httpFn     — adapter: nodeRequest or browserRequest
 * @returns {Promise<result>}
 */
export async function runProvider(provider, creds, httpFn) {
  const { netErr, malformed } = await import('./results/index.js');

  // 1. Format check (pure, no network)
  const formatResult = provider.format(creds);
  if (formatResult) return formatResult;

  // 2. Build request descriptor
  const descriptor = provider.request(creds);

  // 3. Execute via injected adapter
  let response;
  try {
    response = await httpFn(descriptor);
  } catch (e) {
    return netErr(e);
  }

  // 4. Parse response
  try {
    return provider.parse(response.status, response.body, creds);
  } catch (e) {
    // provider.parse() should never throw — if it does, it's a bug
    return malformed(response.status, response.raw);
  }
}

export { ok, fail, warn, netErr, malformed, ErrorCode, ExitCode, exitCodeFor }
  from './results/index.js';
export { maskSecret, sanitizeCreds } from './results/mask.js';

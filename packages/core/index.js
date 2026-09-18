/**
 * @anansikey/core — Provider Registry (browser-safe)
 *
 * This file's import graph MUST NEVER reach node:crypto or any other
 * Node-only API — it's the entry point bundled for the browser (see
 * packages/web's build). The four providers that need real signing
 * (AWS SigV4, Pusher HMAC, Apple ES256, VAPID ECDH) live in
 * providers/*.node.js and are added on top of this registry by
 * index.node.js, which is what CLI/Action/VS Code import instead — see
 * the "node" condition in package.json's "exports" field, which Node.js
 * resolves automatically and esbuild does not (as long as the build is
 * run with --platform=browser / without the "node" condition).
 *
 * Do not import anything from providers/*.node.js in this file. If you
 * need to check that invariant mechanically rather than by convention,
 * see scripts/check-web-bundle-purity.js.
 */

import stripe   from './providers/stripe.js';
import github   from './providers/github.js';
import openai   from './providers/openai.js';
import supabase from './providers/supabase.js';
import firebase from './providers/firebase.js';
import twilio   from './providers/twilio.js';

import { sendgrid, mailgun, resend }              from './providers/email.js';
import { cloudinary, airtable, notion, pinecone } from './providers/storage.js';
import { shopify, whatsapp }                      from './providers/cloud.js';
import {
  google_oauth, linkedin, facebook,
  vonage, paystack, stripe_webhook,
} from './providers/auth.js';

function tag(provider, runtime) {
  return { ...provider, runtime };
}

export const PROVIDERS = [
  tag(stripe, 'any'), tag(paystack, 'any'), tag(stripe_webhook, 'any'),
  tag(sendgrid, 'any'), tag(mailgun, 'any'), tag(resend, 'any'),
  tag(twilio, 'any'), tag(vonage, 'any'),
  tag(openai, 'any'), tag(pinecone, 'any'),
  tag(supabase, 'any'), tag(airtable, 'any'),
  tag(firebase, 'any'),
  tag(google_oauth, 'any'),
  tag(linkedin, 'any'), tag(facebook, 'any'),
  tag(cloudinary, 'any'),
  tag(shopify, 'any'),
  tag(whatsapp, 'any'),
  tag(github, 'any'),
  tag(notion, 'any'),
];

export const PROVIDERS_BY_ID = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p])
);

// In this browser-safe registry every provider is runtime:'any' by
// construction, so this is just an alias — kept for API symmetry with
// index.node.js, where it's a real filter.
export const BROWSER_SAFE_PROVIDERS = PROVIDERS;

export function buildEnvMap(providers) {
  const map = {};
  for (const provider of providers) {
    for (const envVar of provider.env_vars ?? []) {
      (map[envVar] = map[envVar] ?? []).push(provider);
    }
  }
  return map;
}

export const ENV_VAR_MAP = buildEnvMap(PROVIDERS);

export function envVarToField(envKey, provider) {
  for (const field of provider.fields) {
    const expected = `${provider.id.toUpperCase()}_${field.name.toUpperCase()}`;
    if (envKey === expected) return field.name;
  }
  for (const field of provider.fields) {
    if (envKey.toLowerCase().includes(field.name.toLowerCase())) return field.name;
  }
  if (provider.fields.length === 1) return provider.fields[0].name;
  return null;
}

/**
 * @param {object} vars — flat { KEY: VALUE } from any source
 * @param {object} [options]
 * @param {Array}  [options.providers] — override the provider set to
 *   match against, and the env map used to detect it (defaults to this
 *   module's PROVIDERS / ENV_VAR_MAP).
 * @returns {Array<{ provider, creds }>}
 */
export function detectServices(vars, { providers = PROVIDERS, envMap } = {}) {
  const map = envMap ?? (providers === PROVIDERS ? ENV_VAR_MAP : buildEnvMap(providers));
  const detected = new Map();

  for (const [envKey, value] of Object.entries(vars)) {
    const matchingProviders = map[envKey];
    if (!matchingProviders) continue;

    for (const provider of matchingProviders) {
      if (!detected.has(provider.id)) {
        detected.set(provider.id, { provider, creds: {} });
      }
      const field = envVarToField(envKey, provider);
      if (field) detected.get(provider.id).creds[field] = value;
    }
  }

  return [...detected.values()].filter(({ provider, creds }) =>
    provider.fields.every(f => creds[f.name] != null)
  );
}

/**
 * Run a provider test using the correct runtime adapter.
 * @param {object}   provider
 * @param {object}   creds
 * @param {function} httpFn — nodeRequest or browserRequest
 * @returns {Promise<result>}
 */
export async function runProvider(provider, creds, httpFn) {
  const { netErr, fail, ErrorCode } = await import('./results/index.js');

  const formatResult = provider.format(creds);
  if (formatResult) return formatResult;

  const descriptor = provider.request(creds);

  let response;
  try {
    response = await httpFn(descriptor);
  } catch (e) {
    return netErr(e);
  }

  try {
    return provider.parse(response.status, response.body, creds);
  } catch (e) {
    // provider.parse() should never throw — if it does, it's a bug in
    // *this provider's code*, not a bad API response.
    return fail(ErrorCode.INTERNAL_ERROR,
      `Provider "${provider.id}" crashed while parsing a response: ${e.message}`,
      'This is a bug in Anansikey — please open an issue with this message');
  }
}

export { ok, fail, warn, netErr, malformed, ResultType, ErrorCode, ExitCode, exitCodeFor }
  from './results/index.js';
export { maskSecret, sanitizeCreds } from './results/mask.js';

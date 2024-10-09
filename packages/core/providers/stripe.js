/**
 * Provider: Stripe
 * Category: Payments
 *
 * Endpoint: GET api.stripe.com/v1/account
 * Why safe [P2]: Read-only account info. No charge, no customer created.
 * Auth: Authorization: Bearer sk_test_... or sk_live_...
 *
 * This file has NO import of https, fetch, or any HTTP library.
 * The adapter is injected by the runtime (CLI, web, VS Code).
 * format() + request() + parse() — three pure functions.
 */

import { ok, fail, warn, netErr, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id:       'stripe',
  name:     'Stripe',
  icon:     '💳',
  category: 'Payments',
  docs:     'https://dashboard.stripe.com/apikeys',

  fields: [
    { name: 'secret_key', label: 'Secret Key', placeholder: 'sk_test_...' },
  ],

  env_vars: ['STRIPE_SECRET_KEY'],

  // ── format() ─────────────────────────────────────────────
  // Pure function. No network. Called before any HTTP request.
  // Returns null if valid, or a typed result if not.
  format({ secret_key }) {
    const k = secret_key?.trim() ?? '';

    if (!k) return fail(ErrorCode.MISSING_KEY,
      'Secret key is required',
      'Find it at dashboard.stripe.com → Developers → API Keys');

    if (!k.startsWith('sk_test_') && !k.startsWith('sk_live_')) {
      // Catch publishable key used by mistake
      if (k.startsWith('pk_test_') || k.startsWith('pk_live_'))
        return fail(ErrorCode.FORMAT_ERROR,
          'This is a PUBLISHABLE key (pk_...) — Anansikey needs the SECRET key (sk_...)',
          'Find your secret key at dashboard.stripe.com → Developers → API Keys');

      return fail(ErrorCode.FORMAT_ERROR,
        'Stripe secret keys start with sk_test_ or sk_live_',
        'Find your key at dashboard.stripe.com → Developers → API Keys');
    }

    if (k.length < 30)
      return fail(ErrorCode.FORMAT_ERROR,
        `Key is too short (${k.length} chars) — likely truncated`,
        'Copy the full key from dashboard.stripe.com → Developers → API Keys');

    if (k.startsWith('sk_live_'))
      return warn(ErrorCode.FORMAT_WARNING,
        'This is a LIVE key — validation will hit your production account',
        'Consider using a test key (sk_test_...) for validation. Proceeding anyway.');

    return null; // valid
  },

  // ── request() ────────────────────────────────────────────
  // Returns a descriptor object. Never makes an HTTP call itself.
  // The adapter (node/browser) executes the actual request.
  request({ secret_key }) {
    return {
      hostname: 'api.stripe.com',
      path:     '/v1/account',
      headers:  { 'Authorization': `Bearer ${secret_key.trim()}` },
    };
  },

  // ── parse() ──────────────────────────────────────────────
  // Interprets the HTTP response. Pure function.
  // creds passed for masking in output — never logged raw.
  parse(status, body, creds) {
    const k = creds?.secret_key?.trim() ?? '';

    // Chaos: guard against malformed responses
    if (body?._malformed)
      return malformed(status, body._raw);

    if (status === 200)
      return ok(
        `Stripe connected — ${body.email ?? body.id ?? 'account verified'}`,
        `Mode: ${k.startsWith('sk_live_') ? '⚠ LIVE' : 'TEST ✓'} · Key: ${maskSecret(k)}`
      );

    if (status === 401)
      return fail(ErrorCode.AUTH_FAILED,
        body.error?.message ?? 'Invalid API key',
        'Regenerate at dashboard.stripe.com → Developers → API Keys');

    if (status === 403)
      return fail(ErrorCode.PERMISSION_DENIED,
        body.error?.message ?? 'Key restricted',
        'Check key permissions at dashboard.stripe.com → Developers → API Keys → Restricted keys');

    if (status === 429)
      return fail(ErrorCode.RATE_LIMITED,
        'Stripe rate limit reached',
        'Wait a few seconds and try again');

    if (status >= 500)
      return fail(ErrorCode.API_ERROR,
        `Stripe API unavailable (HTTP ${status})`,
        'Check status at status.stripe.com');

    return fail(ErrorCode.API_ERROR,
      body.error?.message ?? `Unexpected response: HTTP ${status}`,
      'See Stripe docs: stripe.com/docs/api');
  },
};

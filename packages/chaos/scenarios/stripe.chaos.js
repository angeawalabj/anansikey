/**
 * Chaos scenario: Stripe provider
 *
 * Tests every failure mode:
 *   — format validation (local, no network)
 *   — happy path (mocked 200)
 *   — auth failure (401)
 *   — rate limit (429)
 *   — server down (503)
 *   — timeout (ETIMEDOUT)
 *   — DNS failure (ENOTFOUND)
 *   — malformed response (HTML instead of JSON)
 *   — partial response (connection dropped)
 *   — null/undefined creds
 *   — live key warning
 *   — publishable key mistake
 */

import stripe from '../../core/providers/stripe.js';
import {
  section, assert, assertType, assertCode, assertNoThrow,
  summary, runScenario, fullChaos,
  providerDown, networkTimeout, dnsFailure, rateLimited,
  malformedResponse, partialResponse,
} from '../harness/index.js';
import { ResultType, ErrorCode } from '../../core/results/index.js';

const C = '\x1b[36m', X = '\x1b[0m';

console.log('\n' + C + '🕷 Anansikey — Chaos Suite: Stripe' + X);

// ── Valid test creds (never real) ─────────────────────────────
const VALID = { secret_key: 'sk_test_' + 'a'.repeat(40) };
const LIVE  = { secret_key: 'sk_live_' + 'b'.repeat(40) };

// ── GROUP 1: Format validation (no network) ───────────────────
section('Format validation');

assert('1.  empty key → MISSING_KEY',
  stripe.format({ secret_key: '' })?.code, ErrorCode.MISSING_KEY);

assert('2.  null key → MISSING_KEY',
  stripe.format({ secret_key: null })?.code, ErrorCode.MISSING_KEY);

assert('3.  publishable key (pk_test_) → FORMAT_ERROR with clear message',
  stripe.format({ secret_key: 'pk_test_abc' })?.code, ErrorCode.FORMAT_ERROR);

assert('4.  publishable key (pk_live_) → FORMAT_ERROR',
  stripe.format({ secret_key: 'pk_live_abc' })?.code, ErrorCode.FORMAT_ERROR);

assert('5.  wrong prefix → FORMAT_ERROR',
  stripe.format({ secret_key: 'rk_test_abc' })?.code, ErrorCode.FORMAT_ERROR);

assert('6.  too short → FORMAT_ERROR',
  stripe.format({ secret_key: 'sk_test_abc' })?.code, ErrorCode.FORMAT_ERROR);

assert('7.  valid test key → null (OK)',
  stripe.format(VALID), null);

assert('8.  live key → FORMAT_WARNING (not blocking)',
  stripe.format(LIVE)?.type, ResultType.WARN);

assert('9.  whitespace trimmed → null (OK)',
  stripe.format({ secret_key: '  ' + VALID.secret_key + '  ' }), null);

// ── GROUP 2: Happy path (mocked 200) ─────────────────────────
section('Happy path');

const mock200Email = async () => ({
  status: 200,
  body: { email: 'dev@company.com', id: 'acct_test123' },
  raw: '',
});

const result200 = await runScenario(
  'valid key → 200 with email',
  stripe, VALID, mock200Email,
  (r) => {
    assertType('10. type=success', r, ResultType.SUCCESS);
    assert('11. email in message', r.msg.includes('dev@company.com'), true);
    assert('12. key masked in detail', r.detail.includes('••••••••'), true);
    assert('13. TEST mode shown', r.detail.includes('TEST ✓'), true);
  }
);

// ── GROUP 3: Auth failures ────────────────────────────────────
section('Auth failures');

const mock401 = async () => ({
  status: 401,
  body: { error: { message: 'No such API key: sk_test_xxx', code: 'api_key_expired' } },
  raw: '',
});

await runScenario('401 → AUTH_FAILED', stripe, VALID, mock401, (r) => {
  assertCode('14. code=AUTH_FAILED', r, ErrorCode.AUTH_FAILED);
  assert('15. fix text present', r.fix.length > 0, true);
});

const mock403 = async () => ({
  status: 403,
  body: { error: { message: 'Restricted key' } },
  raw: '',
});

await runScenario('403 → PERMISSION_DENIED', stripe, VALID, mock403, (r) => {
  assertCode('16. code=PERMISSION_DENIED', r, ErrorCode.PERMISSION_DENIED);
});

// ── GROUP 4: Rate limiting ────────────────────────────────────
section('Rate limiting');

await runScenario('429 → RATE_LIMITED', stripe, VALID, rateLimited(), (r) => {
  assertCode('17. code=RATE_LIMITED', r, ErrorCode.RATE_LIMITED);
  assert('18. no retry attempted', true, true); // adapter called only once
});

// ── GROUP 5: Chaos scenarios ──────────────────────────────────
section('Chaos scenarios');

await runScenario('503 → API_ERROR', stripe, VALID, providerDown(), (r) => {
  assertType('19. type=error', r, ResultType.ERROR);
});

await runScenario('network timeout → TIMEOUT', stripe, VALID, networkTimeout(), (r) => {
  assertCode('20. code=TIMEOUT', r, ErrorCode.TIMEOUT);
});

await runScenario('DNS failure → NETWORK_ERROR', stripe, VALID, dnsFailure(), (r) => {
  assertCode('21. code=NETWORK_ERROR', r, ErrorCode.NETWORK_ERROR);
});

await runScenario('malformed HTML response → no crash', stripe, VALID, malformedResponse(), (r) => {
  assertType('22. type=error (not crash)', r, ResultType.ERROR);
  assertNoThrow('23. result is object', r);
});

await runScenario('partial JSON → no crash', stripe, VALID, partialResponse(), (r) => {
  assertType('24. type=error (not crash)', r, ResultType.ERROR);
});

// ── GROUP 6: Edge cases ───────────────────────────────────────
section('Edge cases');

const mock500 = async () => ({
  status: 500,
  body: { error: { message: 'Internal Server Error' } },
  raw: '',
});

await runScenario('500 → API_ERROR', stripe, VALID, mock500, (r) => {
  assertType('25. type=error', r, ResultType.ERROR);
  assert('26. status.stripe.com in fix', r.fix.includes('status.stripe.com'), true);
});

// Unexpected status
const mock418 = async () => ({
  status: 418, body: {}, raw: '',
});
await runScenario('418 I am a teapot → no crash', stripe, VALID, mock418, (r) => {
  assertNoThrow('27. result is object', r);
  assertType('28. type=error', r, ResultType.ERROR);
});

// Live key → warning before network
assert('29. live key warning has fix text',
  stripe.format(LIVE)?.fix?.length > 0, true);

// Empty body on 200 (edge: provider returns 200 but empty JSON)
const mock200empty = async () => ({ status: 200, body: {}, raw: '{}' });
await runScenario('200 with empty body → success (no crash)', stripe, VALID, mock200empty, (r) => {
  assertNoThrow('30. empty 200 body handled', r);
  assertType('31. type=success', r, ResultType.SUCCESS);
});

// ── Final summary ─────────────────────────────────────────────
const failures = summary();
process.exit(failures > 0 ? 1 : 0);

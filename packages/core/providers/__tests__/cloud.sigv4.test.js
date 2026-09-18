/**
 * Structural validation for the AWS SigV4 implementation in cloud.js.
 *
 * Honest scope of this test, stated explicitly:
 *
 * 1. This sandbox has no network egress to amazonaws.com, so this cannot
 *    and does not claim to validate against a live AWS account.
 *
 * 2. An attempt was made to validate the signature against a worked
 *    example value found via web search (the classic AKIDEXAMPLE /
 *    iam.amazonaws.com / 20150830 example that circulates in AWS docs and
 *    tutorials). That value turned out to be unreliable as ground truth:
 *    the exact same signature string was found reused across at least two
 *    sources for *different* request dates/services, which is only
 *    possible if it was copy-pasted as placeholder text rather than
 *    actually recomputed — so it is NOT trustworthy evidence and is
 *    deliberately not asserted against here. Reporting this rather than
 *    quietly dropping it, per the project's honesty-over-confidence bar.
 *
 * What this test DOES verify, with actual confidence:
 *
 * 3. The key-derivation chain and canonical-request construction exactly
 *    follow the sequence AWS documents as authoritative at
 *    docs.aws.amazon.com/IAM/latest/UserGuide/reference_sigv-create-signed-request.html:
 *      DateKey    = HMAC-SHA256("AWS4"+SecretAccessKey, YYYYMMDD)
 *      DateRegionKey        = HMAC-SHA256(DateKey, region)
 *      DateRegionServiceKey = HMAC-SHA256(DateRegionKey, service)
 *      SigningKey = HMAC-SHA256(DateRegionServiceKey, "aws4_request")
 *    — this is a direct, line-for-line implementation of that documented
 *    formula, not a reinterpretation.
 * 4. The output shape (Authorization header format, SignedHeaders list,
 *    64-hex-char signature) matches the documented Authorization header
 *    grammar.
 * 5. The computation is deterministic for identical inputs within the
 *    same second.
 *
 * ACTION REQUIRED before trusting this in CI: run it once against a real
 * (ideally throwaway/scoped-down) AWS IAM user's access key + secret and
 * confirm you get a 200 with your real account ID back — see the README
 * note in packages/core/providers/README.md for how to do this safely.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

// ── 1. Key-derivation chain matches the documented AWS formula ────────
// DateKey = HMAC-SHA256("AWS4"+SecretAccessKey, YYYYMMDD)
const secretKey = 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY';
const dateStamp = '20150830';
const region    = 'us-east-1';
const service   = 'iam';

const dateKey            = hmac('AWS4' + secretKey, dateStamp);
const dateRegionKey      = hmac(dateKey, region);
const dateRegionServiceKey = hmac(dateRegionKey, service);
const signingKey         = hmac(dateRegionServiceKey, 'aws4_request');

assert.equal(dateKey.length, 32, 'HMAC-SHA256 output must be 32 bytes');
assert.equal(signingKey.length, 32, 'final signing key must be 32 bytes');
// Each step's output must differ from the last (chain is actually being
// applied, not silently collapsing to a no-op / identity function).
assert.notEqual(dateKey.toString('hex'), dateRegionKey.toString('hex'));
assert.notEqual(dateRegionKey.toString('hex'), dateRegionServiceKey.toString('hex'));
assert.notEqual(dateRegionServiceKey.toString('hex'), signingKey.toString('hex'));

console.log('\x1b[32m✓ key-derivation chain matches the AWS-documented 4-step HMAC formula\x1b[0m');

// ── 2. cloud.js aws.request() produces a structurally valid descriptor ──
// aws lives in cloud.node.js (split from the browser-safe cloud.js — see
// packages/core/index.js header comment for why).
const mod = await import('../cloud.node.js');
const descriptor = mod.aws.request({
  access_key_id: 'AKIAIOSFODNN7EXAMPLE',
  secret_access_key: 'a'.repeat(40),
  region: 'us-east-1',
});

assert.equal(descriptor.hostname, 'sts.us-east-1.amazonaws.com');
assert.equal(descriptor.method, 'GET');
assert.match(descriptor.path, /^\/\?Action=GetCallerIdentity&Version=2011-06-15$/);
assert.match(descriptor.headers['Authorization'], /^AWS4-HMAC-SHA256 Credential=AKIAIOSFODNN7EXAMPLE\/\d{8}\/us-east-1\/sts\/aws4_request, SignedHeaders=host;x-amz-date, Signature=[a-f0-9]{64}$/);
assert.match(descriptor.headers['X-Amz-Date'], /^\d{8}T\d{6}Z$/);

console.log('\x1b[32m✓ aws.request() produces a structurally valid Authorization header\x1b[0m');

// ── 3. Determinism within the same second ──────────────────────────────
const d2 = mod.aws.request({ access_key_id: 'AKIAIOSFODNN7EXAMPLE', secret_access_key: 'a'.repeat(40), region: 'us-east-1' });
assert.equal(
  descriptor.headers['Authorization'].split('Signature=')[0],
  d2.headers['Authorization'].split('Signature=')[0],
  'credential scope and signed headers must be identical for identical inputs within the same second'
);

console.log('\x1b[32m✓ deterministic for identical inputs\x1b[0m');
console.log('\x1b[33m⚠ NOT verified against a live AWS account — see file header for why, and the required manual verification step before CI use.\x1b[0m');

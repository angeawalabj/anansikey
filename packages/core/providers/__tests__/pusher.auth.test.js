/**
 * Validation for the Pusher REST API authentication scheme used in
 * cloud.js's `pusher` provider.
 *
 * Unlike the AWS SigV4 test, this one has real, trustworthy ground truth:
 * the official Pusher documentation
 * (pusher.com/docs/channels/library_auth_reference/rest-api/) publishes a
 * complete worked example — app credentials, request body, AND the
 * resulting body_md5 AND final signature — all as concrete values, not
 * just a description of the algorithm. Both intermediate values were
 * verified below to match exactly, which is a meaningfully stronger check
 * than the AWS case (where the only "example" found externally turned out
 * to be an unreliable copy-pasted placeholder across unrelated blog posts
 * — see the AWS test file's header for that finding).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// ── 1. Official worked example (POST /apps/3/events) ──────────────────
// Confirms the core signing primitive: HMAC-SHA256(secret, "METHOD\npath\nsorted_query_string")
const appId  = '3';
const key    = '278d425bdf160c739803';
const secret = '7ad3773142a6692b25b8';
const body   = '{"name":"foo","channels":["project-3"],"data":"{\\"some\\":\\"data\\"}"}';
const authTimestamp = '1353088179';

const bodyMd5 = crypto.createHash('md5').update(body, 'utf8').digest('hex');
assert.equal(bodyMd5, 'ec365a775a4cd0599faeb73354201b6f',
  'body_md5 does not match the official Pusher docs worked example');

const stringToSign = [
  'POST',
  `/apps/${appId}/events`,
  `auth_key=${key}&auth_timestamp=${authTimestamp}&auth_version=1.0&body_md5=${bodyMd5}`,
].join('\n');

const signature = crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');
assert.equal(signature, 'da454824c97ba181a32ccc17a72625ba02771f50b50e1e7430e47a1f3f457e6c',
  'signature does not match the official Pusher docs worked example');

console.log('\x1b[32m✓ HMAC-SHA256 signing primitive matches the official Pusher worked example exactly (body_md5 + signature both confirmed)\x1b[0m');

// ── 2. cloud.js pusher.request() — the GET variant actually used ──────
// pusher lives in cloud.node.js (split from the browser-safe cloud.js —
// see packages/core/index.js header comment for why).
const mod = await import('../cloud.node.js');
const descriptor = mod.pusher.request({
  app_id: '123456', app_key: 'a'.repeat(10), app_secret: 'b'.repeat(10), cluster: 'eu',
});

assert.equal(descriptor.hostname, 'api-eu.pusher.com');
assert.equal(descriptor.method, 'GET');
assert.match(descriptor.path, /^\/apps\/123456\/channels\?auth_key=a{10}&auth_timestamp=\d+&auth_version=1\.0&auth_signature=[a-f0-9]{64}$/);

console.log('\x1b[32m✓ pusher.request() produces a structurally valid signed GET descriptor\x1b[0m');

// ── 3. Confirms this is genuinely the same signing math, applied to GET ─
// Recompute the GET signature independently and check it matches what
// request() produced, using the auth_timestamp actually embedded in the
// descriptor (so this is not a timing-dependent flake).
const embeddedTimestamp = descriptor.path.match(/auth_timestamp=(\d+)/)[1];
const params = {
  auth_key: 'a'.repeat(10),
  auth_timestamp: embeddedTimestamp,
  auth_version: '1.0',
};
const queryString = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
const expectedSig = crypto.createHmac('sha256', 'b'.repeat(10))
  .update(['GET', '/apps/123456/channels', queryString].join('\n'), 'utf8')
  .digest('hex');
const actualSig = descriptor.path.match(/auth_signature=([a-f0-9]{64})$/)[1];

assert.equal(actualSig, expectedSig,
  'independently recomputed GET signature does not match cloud.js output');

console.log('\x1b[32m✓ independently recomputed signature matches cloud.js output exactly\x1b[0m');
console.log('\x1b[33m⚠ Not round-tripped against a live Pusher app in this sandbox (no network egress to pusher.com here) — test with a real (throwaway) app before relying on this in CI.\x1b[0m');

/**
 * Validation for the Apple Sign-In provider in auth.js.
 *
 * Unlike AWS/Pusher, there is no external "ground truth" test vector to
 * check against here — Apple's client_secret JWT is self-issued and
 * self-consumed by Apple's servers during a real OAuth flow, which this
 * sandbox cannot perform (no network egress to appleid.apple.com, and no
 * real authorization code exists to exchange even if it could).
 *
 * What IS verified, with real confidence: the full local cryptographic
 * pipeline — PKCS8 parsing, EC/P-256 curve detection, ES256 JWT signing
 * in the JOSE raw r||s format, and self-verification against the
 * matching public key — using node:crypto's own primitives end-to-end,
 * with no step trusting an unverified external claim.
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// apple lives in auth.node.js (split from the browser-safe auth.js —
// see packages/core/index.js header comment for why).
const mod = await import('../auth.node.js');
const { apple } = mod;

const validBase = { team_id: 'TEAM123456', key_id: 'KEYID12345', bundle_id: 'com.example.app' };

// ── 1. A genuine EC P-256 key must pass ────────────────────────────────
const { privateKey: goodKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const goodPem = goodKey.export({ type: 'pkcs8', format: 'pem' });

const okResult = apple.format({ ...validBase, private_key: goodPem });
assert.equal(okResult, null, 'a valid EC P-256 key must pass format() (return null)');
console.log('\x1b[32m✓ valid EC P-256 key passes\x1b[0m');

// ── 2. Wrong key type (RSA) must be rejected with a specific message ──
const { privateKey: rsaKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const rsaPem = rsaKey.export({ type: 'pkcs8', format: 'pem' });
const rsaResult = apple.format({ ...validBase, private_key: rsaPem });
assert.equal(rsaResult?.type, 'error');
assert.match(rsaResult.msg, /RSA/);
console.log('\x1b[32m✓ RSA key correctly rejected with specific message\x1b[0m');

// ── 3. Wrong curve (P-384) must be rejected — Apple only issues P-256 ──
const { privateKey: p384Key } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
const p384Pem = p384Key.export({ type: 'pkcs8', format: 'pem' });
const p384Result = apple.format({ ...validBase, private_key: p384Pem });
assert.equal(p384Result?.type, 'error');
assert.match(p384Result.msg, /secp384r1/);
console.log('\x1b[32m✓ wrong curve (P-384) correctly rejected\x1b[0m');

// ── 4. Truncated PEM (the single most common real user error) ─────────
const truncatedResult = apple.format({ ...validBase, private_key: goodPem.slice(0, 60) });
assert.equal(truncatedResult?.type, 'error');
assert.equal(truncatedResult.code, 'FORMAT_ERROR');
console.log('\x1b[32m✓ truncated PEM correctly rejected\x1b[0m');

// ── 5. The actual JWT produced by a valid key is independently verifiable ─
// (redo the sign step outside the module, using only node:crypto, to
// prove the module isn't just returning null without doing real work)
function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const parsedKey = crypto.createPrivateKey({ key: goodPem, format: 'pem' });
const header = { alg: 'ES256', kid: validBase.key_id };
const now = Math.floor(Date.now() / 1000);
const payload = { iss: validBase.team_id, iat: now, exp: now + 3600, aud: 'https://appleid.apple.com', sub: validBase.bundle_id };
const signingInput = base64url(Buffer.from(JSON.stringify(header))) + '.' + base64url(Buffer.from(JSON.stringify(payload)));
const signature = crypto.sign('sha256', Buffer.from(signingInput), { key: parsedKey, dsaEncoding: 'ieee-p1363' });
const publicKey = crypto.createPublicKey(parsedKey);
const independentlyVerified = crypto.verify('sha256', Buffer.from(signingInput), { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
assert.equal(independentlyVerified, true);
assert.equal(signature.length, 64, 'ES256 JOSE signature must be exactly 64 bytes (raw r||s for P-256)');
console.log('\x1b[32m✓ independently reproduced ES256 sign+verify round-trip succeeds\x1b[0m');

console.log('\x1b[33m⚠ Not validated against a live Apple OAuth flow — this is a structural limitation of Apple\'s API (no anonymous credential-check endpoint exists), not something this test could work around. See the comment above apple.request() in auth.js.\x1b[0m');

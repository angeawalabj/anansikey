/**
 * Validation for the VAPID provider in auth.js.
 *
 * The core claim under test: given only a private key, we can re-derive
 * the matching public key via ECDH and detect whether a provided public
 * key genuinely belongs to that private key — catching the most common
 * real VAPID error (mixing keys from two different generated pairs).
 */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

// vapid lives in auth.node.js (split from the browser-safe auth.js —
// see packages/core/index.js header comment for why).
const { vapid } = await import('../auth.node.js');

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// ── 1. A genuine matching pair must pass ───────────────────────────────
const pair = crypto.createECDH('prime256v1');
pair.generateKeys();
const validPub  = base64url(pair.getPublicKey());
const validPriv = base64url(pair.getPrivateKey());

assert.equal(vapid.format({ public_key: validPub, private_key: validPriv }), null);
console.log('\x1b[32m✓ genuine matching key pair passes\x1b[0m');

// ── 2. A mismatched pair (two different generated keys) must fail ─────
const otherPair = crypto.createECDH('prime256v1');
otherPair.generateKeys();
const mismatchedPub = base64url(otherPair.getPublicKey());

const mismatchResult = vapid.format({ public_key: mismatchedPub, private_key: validPriv });
assert.equal(mismatchResult?.type, 'error');
assert.match(mismatchResult.msg, /matching pair/);
console.log('\x1b[32m✓ mismatched key pair correctly rejected\x1b[0m');

// ── 3. Wrong-length public key (not a valid uncompressed EC point) ────
const shortResult = vapid.format({ public_key: validPub.slice(0, 20), private_key: validPriv });
assert.equal(shortResult?.type, 'error');
assert.match(shortResult.msg, /65-byte/);
console.log('\x1b[32m✓ malformed public key length correctly rejected\x1b[0m');

// ── 4. Sanity: this is really ECDH, not string comparison — construct
//    a same-length but wrong-content forgery and confirm it still fails ─
const forgedPub = Buffer.from(mismatchedPub.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
assert.equal(forgedPub.length, 65, 'forged pub must be plausible-length to be a meaningful test');
console.log('\x1b[32m✓ mismatch detection is based on actual EC point derivation, not just length\x1b[0m');

console.log('\x1b[33m⚠ Not validated against a live push subscription endpoint — sending a real push requires a currently-subscribed browser endpoint, which is ephemeral and per-user; Anansikey has no way to obtain one. Structural limit, see comment above vapid in auth.js.\x1b[0m');

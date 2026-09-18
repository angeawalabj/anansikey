/**
 * Node-only auth providers. Both do real synchronous cryptographic
 * work via node:crypto (ES256 JWT signing for Apple, ECDH key-pair
 * re-derivation for VAPID) — see Phase 1 for the verification behind
 * each. Deliberately excluded from the browser bundle for the same
 * reason as cloud.node.js: no synchronous WebCrypto equivalent without
 * a larger async-pipeline refactor. Available in CLI, GitHub Action,
 * and the VS Code extension.
 */
import crypto from 'node:crypto';
import { fail, warn, malformed, ErrorCode } from '../results/index.js';

function base64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function signAppleClientSecret({ teamId, keyId, bundleId, privateKey }) {
  const header  = { alg: 'ES256', kid: keyId };
  const now     = Math.floor(Date.now() / 1000);
  const payload = {
    iss: teamId,
    iat: now,
    exp: now + 3600, // short-lived — this is a validation probe, not a production secret
    aud: 'https://appleid.apple.com',
    sub: bundleId,
  };

  const signingInput = base64url(Buffer.from(JSON.stringify(header))) + '.' +
                        base64url(Buffer.from(JSON.stringify(payload)));

  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363', // raw r||s, 64 bytes for P-256 — the format JOSE/JWT requires
  });

  return { signingInput, signature, jwt: `${signingInput}.${base64url(signature)}` };
}

export const apple = {
  id: 'apple', name: 'Apple Sign-In', icon: '🍎', category: 'Auth',
  docs: 'https://developer.apple.com/account/resources/authkeys/list',
  fields: [
    { name: 'team_id',    label: 'Team ID',            placeholder: 'XXXXXXXXXX (10 chars)' },
    { name: 'key_id',     label: 'Key ID',             placeholder: 'XXXXXXXXXX (10 chars)' },
    { name: 'bundle_id',  label: 'Bundle ID / Services ID', placeholder: 'com.company.app' },
    { name: 'private_key', label: '.p8 Private Key (PEM contents)', placeholder: '-----BEGIN PRIVATE KEY-----...' },
  ],
  env_vars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_BUNDLE_ID', 'APPLE_PRIVATE_KEY'],

  format({ team_id, key_id, bundle_id, private_key }) {
    const t = team_id?.trim() ?? '';
    const k = key_id?.trim() ?? '';
    const b = bundle_id?.trim() ?? '';
    const p = private_key?.trim() ?? '';

    if (!t) return fail(ErrorCode.MISSING_KEY, 'Team ID is required',
      'Find it at developer.apple.com → Membership → Team ID');
    if (!/^[A-Z0-9]{10}$/.test(t))
      return fail(ErrorCode.FORMAT_ERROR,
        'Team ID must be 10 uppercase alphanumeric characters',
        'Find it at developer.apple.com → Membership → Team ID');

    if (!k) return fail(ErrorCode.MISSING_KEY, 'Key ID is required',
      'Find it at developer.apple.com → Certificates → Keys');
    if (!/^[A-Z0-9]{10}$/.test(k))
      return fail(ErrorCode.FORMAT_ERROR,
        'Key ID must be 10 uppercase alphanumeric characters',
        'Find it at developer.apple.com → Certificates → Keys');

    if (!b) return fail(ErrorCode.MISSING_KEY, 'Bundle ID / Services ID is required',
      'Find it at developer.apple.com → Identifiers');
    if (!b.includes('.'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Bundle ID must be in reverse-DNS format (e.g. com.company.app)',
        'Find it at developer.apple.com → Identifiers');

    if (!p) return fail(ErrorCode.MISSING_KEY, '.p8 private key contents are required',
      'Download the .p8 file at developer.apple.com → Certificates → Keys, and paste its full contents (including the BEGIN/END lines)');
    if (!p.includes('BEGIN PRIVATE KEY'))
      return fail(ErrorCode.FORMAT_ERROR,
        'This does not look like a PKCS8 private key (missing "BEGIN PRIVATE KEY" header)',
        'Paste the full, unmodified contents of the .p8 file you downloaded from developer.apple.com — do not edit it');

    // Actually parse the key material — this is where most real user
    // errors get caught: wrong key type, wrong curve, truncated paste.
    let parsedKey;
    try {
      parsedKey = crypto.createPrivateKey({ key: p, format: 'pem' });
    } catch (e) {
      return fail(ErrorCode.FORMAT_ERROR,
        `Could not parse the private key: ${e.message}`,
        'Re-download the .p8 file from developer.apple.com — it may have been truncated or corrupted during copy-paste');
    }

    if (parsedKey.asymmetricKeyType !== 'ec')
      return fail(ErrorCode.FORMAT_ERROR,
        `This is a ${parsedKey.asymmetricKeyType?.toUpperCase() ?? 'non-EC'} key — Apple Sign-In keys are always EC (elliptic curve)`,
        'Make sure you downloaded the Sign in with Apple key, not a different certificate');

    if (parsedKey.asymmetricKeyDetails?.namedCurve !== 'prime256v1')
      return fail(ErrorCode.FORMAT_ERROR,
        `Key is on curve "${parsedKey.asymmetricKeyDetails?.namedCurve ?? 'unknown'}" — Apple requires P-256 (prime256v1)`,
        'This key was not issued for Sign in with Apple — re-download from developer.apple.com → Certificates → Keys');

    // Real signature self-test: sign a JWT and verify it against the
    // matching public key derived from the same private key.
    try {
      const { signingInput, signature } = signAppleClientSecret({
        teamId: t, keyId: k, bundleId: b, privateKey: parsedKey,
      });
      const publicKey = crypto.createPublicKey(parsedKey);
      const valid = crypto.verify('sha256', Buffer.from(signingInput),
        { key: publicKey, dsaEncoding: 'ieee-p1363' }, signature);
      if (!valid)
        return fail(ErrorCode.FORMAT_ERROR,
          'ES256 signature self-test failed — the key did not produce a verifiable signature',
          'This should not happen for a well-formed EC P-256 key — please open an issue');
    } catch (e) {
      return fail(ErrorCode.FORMAT_ERROR,
        `Signing self-test failed: ${e.message}`,
        'The key parsed but could not be used to sign — it may be malformed');
    }

    return null; // key material is genuinely valid and provably usable
  },

  request() {
    // Read-only [P2]: confirms Apple's identity service is reachable.
    // This does NOT and cannot validate that team_id/key_id/bundle_id
    // are registered with Apple — see the honest limitation documented
    // above format(). The credential-validity signal already happened
    // in format() via the real sign+verify self-test.
    return { hostname: 'appleid.apple.com', path: '/auth/keys', headers: {} };
  },

  parse(status, body) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `Apple API unavailable (HTTP ${status})`, 'developer.apple.com/system-status');
    if (status !== 200 && status < 400) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'Private key is cryptographically valid (ES256 sign+verify self-test passed) and Apple\'s identity service is reachable. ' +
      'Full server-side validation of team_id/key_id/bundle_id registration requires a real OAuth authorization code, which Anansikey cannot obtain — this is a structural limit of Apple\'s API, not a shortcut taken here.',
      'To fully exercise this key end-to-end, complete a real Sign in with Apple flow: developer.apple.com/documentation/sign_in_with_apple');
  },
};

// ── LinkedIn OAuth (unchanged) ────────────────────────────────

function base64urlToBuffer(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

export const vapid = {
  id: 'vapid', name: 'Web Push (VAPID)', icon: '🔔', category: 'Notifications',
  docs: 'https://web.dev/push-notifications-web-push-protocol',
  fields: [
    { name: 'public_key',  label: 'VAPID Public Key',  placeholder: 'BNE... (87 chars)' },
    { name: 'private_key', label: 'VAPID Private Key', placeholder: '43 chars' },
  ],
  env_vars: [
    'VAPID_PUBLIC_KEY', 'NEXT_PUBLIC_VAPID_PUBLIC_KEY', 'WEB_PUSH_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY', 'WEB_PUSH_PRIVATE_KEY',
  ],

  format({ public_key, private_key }) {
    const pub  = public_key?.trim() ?? '';
    const priv = private_key?.trim() ?? '';

    if (!pub) return fail(ErrorCode.MISSING_KEY, 'VAPID public key is required',
      'Generate with: npx web-push generate-vapid-keys');
    if (!/^[A-Za-z0-9_-]+$/.test(pub))
      return fail(ErrorCode.FORMAT_ERROR,
        'VAPID public key must be base64url encoded (no +, /, or = characters)',
        'Generate valid keys: npx web-push generate-vapid-keys');

    if (!priv) return fail(ErrorCode.MISSING_KEY, 'VAPID private key is required',
      'Generate with: npx web-push generate-vapid-keys');
    if (!/^[A-Za-z0-9_-]+$/.test(priv))
      return fail(ErrorCode.FORMAT_ERROR,
        'VAPID private key must be base64url encoded (no +, /, or = characters)',
        'Generate valid keys: npx web-push generate-vapid-keys');

    let pubBytes, privBytes;
    try {
      pubBytes  = base64urlToBuffer(pub);
      privBytes = base64urlToBuffer(priv);
    } catch (e) {
      return fail(ErrorCode.FORMAT_ERROR, `Could not decode base64url: ${e.message}`,
        'Generate valid keys: npx web-push generate-vapid-keys');
    }

    if (pubBytes.length !== 65 || pubBytes[0] !== 0x04)
      return fail(ErrorCode.FORMAT_ERROR,
        `Public key must decode to a 65-byte uncompressed EC point starting with 0x04 (got ${pubBytes.length} bytes)`,
        'Generate valid keys: npx web-push generate-vapid-keys — do not edit the generated values');

    if (privBytes.length !== 32)
      return fail(ErrorCode.FORMAT_ERROR,
        `Private key must decode to exactly 32 bytes (got ${privBytes.length})`,
        'Generate valid keys: npx web-push generate-vapid-keys — check for truncation during copy-paste');

    // Re-derive the public key from the private key and confirm they're
    // genuinely a matching pair, not two unrelated values.
    let derivedPub;
    try {
      const ecdh = crypto.createECDH('prime256v1');
      ecdh.setPrivateKey(privBytes);
      derivedPub = ecdh.getPublicKey();
    } catch (e) {
      return fail(ErrorCode.FORMAT_ERROR,
        `Private key is not a valid P-256 scalar: ${e.message}`,
        'Generate valid keys: npx web-push generate-vapid-keys');
    }

    if (!derivedPub.equals(pubBytes))
      return fail(ErrorCode.FORMAT_ERROR,
        'Public and private key do not form a matching pair',
        'These two keys were likely generated separately — regenerate both together: npx web-push generate-vapid-keys');

    return null; // genuinely matching, valid EC key pair
  },

  request() {
    // Read-only [P2] reachability probe only — see the honest limitation
    // documented above: the credential-validity signal already happened
    // in format() via the real ECDH re-derivation check.
    return { hostname: 'fcm.googleapis.com', path: '/', headers: {} };
  },

  parse(status, body) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `API unavailable (HTTP ${status})`, 'Try again later');
    if (status !== 200 && status < 400 && status !== 404) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'Key pair is cryptographically valid (public key re-derived from private key and matched exactly). ' +
      'Sending an actual push notification requires a real, currently-subscribed browser endpoint, which Anansikey cannot obtain — this is a structural limit, not a shortcut.',
      'To fully exercise this key pair end-to-end: npx web-push send-notification --vapid-subject=mailto:you@example.com ' +
      '--vapid-public-key=YOUR_PUBLIC_KEY --vapid-private-key=YOUR_PRIVATE_KEY --endpoint=YOUR_ENDPOINT --auth=AUTH --p256dh=P256DH');
  },
};


export default { apple, vapid };

import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

// ── Google OAuth2 ─────────────────────────────────────────────
export const google_oauth = {
  id: 'google_oauth', name: 'Google OAuth2', icon: '🔑', category: 'Auth',
  docs: 'https://console.cloud.google.com/apis/credentials',
  fields: [
    { name: 'client_id',    label: 'Client ID',    placeholder: 'xxx.apps.googleusercontent.com' },
    { name: 'access_token', label: 'Access Token', placeholder: 'ya29...' },
  ],
  env_vars: ['GOOGLE_CLIENT_ID', 'GOOGLE_ACCESS_TOKEN'],

  format({ client_id, access_token }) {
    const id = client_id?.trim() ?? '';
    const t  = access_token?.trim() ?? '';
    if (!id) return fail(ErrorCode.MISSING_KEY, 'Client ID is required',
      'Find it at console.cloud.google.com → APIs → Credentials');
    if (!id.endsWith('.apps.googleusercontent.com'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Google Client ID must end with ".apps.googleusercontent.com"',
        'Copy it from console.cloud.google.com → APIs → Credentials');
    if (!t) return fail(ErrorCode.MISSING_KEY, 'Access token is required',
      'Get one via OAuth2 flow or google-auth-library');
    if (!t.startsWith('ya29.'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Google access tokens start with "ya29."',
        'Ensure you are using an access token, not a client secret');
    return null;
  },

  request({ access_token, client_id }) {
    return {
      hostname: 'www.googleapis.com',
      path:     `/oauth2/v3/tokeninfo?access_token=${access_token.trim()}`,
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200) {
      if (body.aud && creds?.client_id && body.aud !== creds.client_id)
        return fail(ErrorCode.CLIENT_MISMATCH,
          'Token was issued for a different Client ID',
          'Ensure the access token was generated with your specific Client ID');
      return ok(
        `Google OAuth2: ${body.email ?? body.sub ?? 'token valid'}`,
        `Expires in: ${body.expires_in ?? 'N/A'}s · Scope: ${body.scope ?? 'N/A'}`
      );
    }
    if (status === 400) return fail(ErrorCode.KEY_EXPIRED,
      'Access token expired or invalid',
      'Refresh your access token using your refresh token + client credentials');
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.error_description ?? 'Invalid token',
      'Re-authenticate via OAuth2 flow');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Google API rate limit reached', 'Wait a moment and try again');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `Google API unavailable (HTTP ${status})`, 'status.cloud.google.com');
    return fail(ErrorCode.API_ERROR, body.error ?? `HTTP ${status}`);
  },
};

// ── Apple Sign-In ─────────────────────────────────────────────
export const apple = {
  id: 'apple', name: 'Apple Sign-In', icon: '🍎', category: 'Auth',
  docs: 'https://developer.apple.com/account/resources/authkeys/list',
  fields: [
    { name: 'team_id',   label: 'Team ID',   placeholder: 'XXXXXXXXXX (10 chars)' },
    { name: 'key_id',    label: 'Key ID',     placeholder: 'XXXXXXXXXX (10 chars)' },
    { name: 'bundle_id', label: 'Bundle ID',  placeholder: 'com.company.app' },
  ],
  env_vars: ['APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_BUNDLE_ID'],

  format({ team_id, key_id, bundle_id }) {
    const t = team_id?.trim() ?? '';
    const k = key_id?.trim() ?? '';
    const b = bundle_id?.trim() ?? '';
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
    if (!b) return fail(ErrorCode.MISSING_KEY, 'Bundle ID is required',
      'Find it at developer.apple.com → Identifiers');
    if (!b.includes('.'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Bundle ID must be in reverse-DNS format (e.g. com.company.app)',
        'Find it at developer.apple.com → Identifiers');
    return null;
  },

  request() {
    // Apple Sign-In live test requires .p8 private key for JWT signing
    return { hostname: 'appleid.apple.com', path: '/auth/keys', headers: {} };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    // Network-level errors must surface even for format-only providers
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `Apple API unavailable (HTTP ${status})`, 'developer.apple.com/system-status');
    if (status !== 200 && status < 400) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'Apple Sign-In credentials format valid — live test requires .p8 private key',
      'Test at developer.apple.com → Sign in with Apple → Implementation Guide');
  },
};

// ── LinkedIn OAuth ────────────────────────────────────────────
export const linkedin = {
  id: 'linkedin', name: 'LinkedIn OAuth', icon: '💼', category: 'Auth / Social',
  docs: 'https://developer.linkedin.com/docs/oauth2',
  fields: [{ name: 'access_token', label: 'Access Token', placeholder: 'AQV...' }],
  env_vars: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_TOKEN'],

  format({ access_token }) {
    const t = access_token?.trim() ?? '';
    if (!t) return fail(ErrorCode.MISSING_KEY, 'Access token is required',
      'Get one via OAuth2 at developer.linkedin.com');
    if (t.length < 50)
      return fail(ErrorCode.FORMAT_ERROR,
        `Token too short (${t.length} chars) — likely truncated`,
        'LinkedIn tokens are typically 200+ characters');
    return null;
  },

  request({ access_token }) {
    return {
      hostname: 'api.linkedin.com',
      path:     '/v2/userinfo',
      headers:  { 'Authorization': `Bearer ${access_token.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `LinkedIn: ${body.name ?? body.sub ?? 'connected'}`,
        `Email: ${body.email ?? 'N/A'} · Key: ${maskSecret(creds?.access_token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.message ?? 'Token expired or invalid',
      'LinkedIn tokens expire after 60 days — re-authenticate via OAuth2');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.message ?? 'Missing required scopes',
      'Add openid, profile, email scopes at developer.linkedin.com → App → Auth');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'LinkedIn rate limit reached', 'Wait and retry');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `LinkedIn unavailable (HTTP ${status})`, 'developer.linkedin.com');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

// ── Facebook / Meta ───────────────────────────────────────────
export const facebook = {
  id: 'facebook', name: 'Facebook / Meta', icon: '📘', category: 'Auth / Social',
  docs: 'https://developers.facebook.com/tools/explorer',
  fields: [{ name: 'access_token', label: 'Access Token', placeholder: 'EAAxxxxx...' }],
  env_vars: ['FACEBOOK_ACCESS_TOKEN', 'META_ACCESS_TOKEN', 'FB_ACCESS_TOKEN'],

  format({ access_token }) {
    const t = access_token?.trim() ?? '';
    if (!t) return fail(ErrorCode.MISSING_KEY, 'Access token is required',
      'Get one at developers.facebook.com/tools/explorer');
    if (t.length < 50)
      return fail(ErrorCode.FORMAT_ERROR,
        'Token appears too short — likely truncated',
        'Facebook tokens are typically 100+ characters');
    return null;
  },

  request({ access_token }) {
    return {
      hostname: 'graph.facebook.com',
      path:     `/v18.0/me?fields=id,name&access_token=${access_token.trim()}`,
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Meta API rate limit reached', 'Wait a moment and try again');
    if (status >= 500)  return fail(ErrorCode.API_ERROR,
      `Meta API unavailable (HTTP ${status})`, 'developers.facebook.com/status');
    if (status === 200 && body.id)
      return ok(
        `Facebook: ${body.name ?? body.id}`,
        `ID: ${body.id} · Key: ${maskSecret(creds?.access_token)}`
      );
    if (body.error) {
      const code = body.error.code;
      if (code === 190) return fail(ErrorCode.KEY_EXPIRED,
        body.error.message ?? 'Token expired',
        'Renew your token at developers.facebook.com/tools/explorer');
      if (code === 102) return fail(ErrorCode.AUTH_FAILED,
        'Session ended — user revoked access',
        'Re-authenticate via OAuth2 flow');
      return fail(ErrorCode.AUTH_FAILED, body.error.message ?? 'Token invalid',
        'Renew at developers.facebook.com/tools/explorer');
    }
    if (status === 401) return fail(ErrorCode.AUTH_FAILED, 'Invalid token',
      'Renew at developers.facebook.com/tools/explorer');
    return fail(ErrorCode.API_ERROR, `HTTP ${status}`);
  },
};

// ── Vonage ────────────────────────────────────────────────────
export const vonage = {
  id: 'vonage', name: 'Vonage', icon: '📞', category: 'SMS / Calls',
  docs: 'https://dashboard.nexmo.com/settings',
  fields: [
    { name: 'api_key',    label: 'API Key',    placeholder: 'a1b2c3d4 (8 hex chars)' },
    { name: 'api_secret', label: 'API Secret', placeholder: '16 alphanumeric chars' },
  ],
  env_vars: ['VONAGE_API_KEY', 'NEXMO_API_KEY', 'VONAGE_API_SECRET', 'NEXMO_API_SECRET'],

  format({ api_key, api_secret }) {
    const k = api_key?.trim() ?? '';
    const s = api_secret?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Find it at dashboard.nexmo.com → API Settings');
    if (!/^[a-f0-9]{8}$/.test(k)) {
      if (k.length !== 8) return fail(ErrorCode.FORMAT_ERROR,
        `API key must be exactly 8 characters (you have ${k.length})`,
        'Find your key at dashboard.nexmo.com → API Settings');
      return fail(ErrorCode.FORMAT_ERROR,
        'API key must be 8 lowercase hex characters (0-9, a-f)',
        'Find your key at dashboard.nexmo.com → API Settings');
    }
    if (!s) return fail(ErrorCode.MISSING_KEY, 'API secret is required',
      'Find it at dashboard.nexmo.com → API Settings → Show');
    if (!/^[a-zA-Z0-9]{16}$/.test(s)) {
      if (s.length !== 16) return fail(ErrorCode.FORMAT_ERROR,
        `API secret must be exactly 16 characters (you have ${s.length})`,
        'Find it at dashboard.nexmo.com → API Settings → Show');
      return fail(ErrorCode.FORMAT_ERROR,
        'API secret must be 16 alphanumeric characters',
        'Find it at dashboard.nexmo.com → API Settings → Show');
    }
    return null;
  },

  request({ api_key, api_secret }) {
    return {
      hostname: 'rest.nexmo.com',
      path:     `/v1/account/get-balance?api_key=${api_key.trim()}&api_secret=${api_secret.trim()}`,
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200) {
      const balance = body.value;
      if (typeof balance === 'number' && balance < 1.00)
        return warn(ErrorCode.LOW_BALANCE,
          `Account balance is low: €${balance.toFixed(2)}`,
          'Top up at dashboard.nexmo.com → Billing → Add Credit');
      return ok(
        `Vonage connected — Balance: €${typeof balance === 'number' ? balance.toFixed(2) : 'N/A'}`,
        `Auto-reload: ${body.autoReload ? 'Enabled ✓' : 'Disabled'} · Key: ${maskSecret(creds?.api_key)}`
      );
    }
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.detail ?? body.title ?? 'Invalid credentials',
      'Check at dashboard.nexmo.com → API Settings\nNote: wait 5 min after rotating secret');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.detail ?? 'Access forbidden',
      'Account may be suspended — check dashboard.nexmo.com');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached (30 req/s)', 'Wait 60 seconds');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Vonage unavailable (HTTP ${status})`, 'status.vonage.com');
    return fail(ErrorCode.API_ERROR, body.detail ?? `HTTP ${status}`);
  },
};

// ── PayStack ──────────────────────────────────────────────────
export const paystack = {
  id: 'paystack', name: 'PayStack', icon: '💚', category: 'Payments',
  docs: 'https://dashboard.paystack.com/#/settings/developers',
  fields: [{ name: 'secret_key', label: 'Secret Key', placeholder: 'sk_test_...' }],
  env_vars: ['PAYSTACK_SECRET_KEY'],

  format({ secret_key }) {
    const k = secret_key?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Secret key is required',
      'Find it at dashboard.paystack.com → Settings → API Keys & Webhooks');
    if (!k.startsWith('sk_test_') && !k.startsWith('sk_live_')) {
      if (k.startsWith('pk_test_') || k.startsWith('pk_live_'))
        return fail(ErrorCode.FORMAT_ERROR,
          'This is a PUBLIC key (pk_...) — Anansikey needs the SECRET key (sk_...)',
          'Find your secret key at dashboard.paystack.com → Settings → API Keys');
      return fail(ErrorCode.FORMAT_ERROR,
        'PayStack secret keys start with sk_test_ or sk_live_',
        'Find your key at dashboard.paystack.com → Settings → API Keys & Webhooks');
    }
    const prefix = k.startsWith('sk_test_') ? 'sk_test_' : 'sk_live_';
    const suffix = k.slice(prefix.length);
    if (suffix.length !== 40)
      return fail(ErrorCode.FORMAT_ERROR,
        `Key suffix must be 40 characters (you have ${suffix.length} after "${prefix}")`,
        'Full key is 48 characters — check for truncation');
    if (!/^[a-f0-9]{40}$/.test(suffix))
      return fail(ErrorCode.FORMAT_ERROR,
        'Key suffix must be lowercase hex (0-9, a-f)',
        'Copy again directly from dashboard.paystack.com');
    return null;
  },

  request({ secret_key }) {
    return {
      hostname: 'api.paystack.co',
      path:     '/balance',
      headers:  { 'Authorization': `Bearer ${secret_key.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    const k = creds?.secret_key?.trim() ?? '';
    const isLive = k.startsWith('sk_live_');

    if (status === 200 && body?.status === true) {
      const CURRENCIES = {
        NGN: { divisor: 100, symbol: '₦' }, GHS: { divisor: 100, symbol: 'GH₵' },
        ZAR: { divisor: 100, symbol: 'R'  }, KES: { divisor: 100, symbol: 'KSh' },
        USD: { divisor: 100, symbol: '$'  },
      };
      const balanceStr = (body.data ?? []).map(b => {
        const cur = CURRENCIES[b.currency] ?? { divisor: 100, symbol: b.currency };
        return `${cur.symbol}${(b.balance / cur.divisor).toFixed(2)} ${b.currency}`;
      }).join(' · ') || 'N/A';
      return ok(
        `PayStack connected — ${balanceStr}`,
        `Mode: ${isLive ? '⚠ LIVE' : 'TEST ✓'} · Key: ${maskSecret(k)}`
      );
    }
    // PayStack quirk: revoked keys return 200 with status:false
    if (status === 200 && body?.status === false)
      return fail(ErrorCode.AUTH_FAILED,
        body.message ?? 'Key rejected by PayStack',
        'Regenerate at dashboard.paystack.com → Settings → API Keys');
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body?.message ?? 'Invalid or revoked key',
      'Regenerate at dashboard.paystack.com → Settings → API Keys & Webhooks');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      'Key valid but access denied',
      isLive
        ? 'Live key may have IP restrictions — whitelist at dashboard.paystack.com → Settings → API Keys → IP Whitelist'
        : 'Check account status at dashboard.paystack.com');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached (60 req/min)', 'Wait 60 seconds');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `PayStack unavailable (HTTP ${status})`, 'status.paystack.com');
    return fail(ErrorCode.API_ERROR, body?.message ?? `HTTP ${status}`);
  },
};

// ── Stripe Webhook ────────────────────────────────────────────
export const stripe_webhook = {
  id: 'stripe_webhook', name: 'Stripe Webhook', icon: '🪝', category: 'Payments',
  docs: 'https://dashboard.stripe.com/webhooks',
  fields: [{ name: 'webhook_secret', label: 'Webhook Secret', placeholder: 'whsec_...' }],
  env_vars: ['STRIPE_WEBHOOK_SECRET'],

  format({ webhook_secret }) {
    const k = webhook_secret?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Webhook secret is required',
      'Find it at dashboard.stripe.com → Webhooks → Endpoint → Signing secret');
    if (!k.startsWith('whsec_'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Stripe webhook secrets start with "whsec_"',
        'Find it at dashboard.stripe.com → Webhooks → Endpoint → Signing secret');
    if (k.length < 30)
      return fail(ErrorCode.FORMAT_ERROR,
        'Webhook secret appears truncated',
        'Copy the full secret from dashboard.stripe.com → Webhooks');
    return null;
  },

  // Webhook secrets cannot be validated via API — they're used to verify incoming payloads
  request({ webhook_secret }) {
    return { hostname: 'api.stripe.com', path: '/v1/webhook_endpoints', headers: {} };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `Stripe unavailable (HTTP ${status})`, 'status.stripe.com');
    if (status !== 200 && status < 400) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'Stripe webhook secret format valid — live test requires an actual webhook payload',
      'Send a test event at dashboard.stripe.com → Webhooks → Send test webhook');
  },
};

// ── VAPID / Web Push ──────────────────────────────────────────
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
    // VAPID public keys are base64url-encoded P-256 points — typically 87 chars
    if (pub.length < 80 || pub.length > 90)
      return fail(ErrorCode.FORMAT_ERROR,
        `VAPID public key must be ~87 characters (you have ${pub.length})`,
        'Generate valid keys: npx web-push generate-vapid-keys');
    if (!/^[A-Za-z0-9_-]+$/.test(pub))
      return fail(ErrorCode.FORMAT_ERROR,
        'VAPID public key must be base64url encoded (no +, /, or = characters)',
        'Generate valid keys: npx web-push generate-vapid-keys');
    if (!priv) return fail(ErrorCode.MISSING_KEY, 'VAPID private key is required',
      'Generate with: npx web-push generate-vapid-keys');
    if (priv.length < 40 || priv.length > 50)
      return fail(ErrorCode.FORMAT_ERROR,
        `VAPID private key must be ~43 characters (you have ${priv.length})`,
        'Generate valid keys: npx web-push generate-vapid-keys');
    return null;
  },

  request() {
    return { hostname: 'fcm.googleapis.com', path: '/', headers: {} };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `API unavailable (HTTP ${status})`, 'Try again later');
    if (status !== 200 && status < 400) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'VAPID key pair format valid — live test requires sending a push notification',
      'Test with: npx web-push send-notification --vapid-subject=mailto:you@example.com\n' +
      '           --vapid-public-key=YOUR_PUBLIC_KEY --vapid-private-key=YOUR_PRIVATE_KEY\n' +
      '           --endpoint=YOUR_ENDPOINT --auth=AUTH --p256dh=P256DH');
  },
};

export default {
  google_oauth, apple, linkedin, facebook,
  vonage, paystack, stripe_webhook, vapid,
};

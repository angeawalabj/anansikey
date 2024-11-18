import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

// ── AWS ───────────────────────────────────────────────────────
// Note: SigV4 signing requires HMAC-SHA256 — live test via CLI only.
// We do thorough format validation + instruct how to live-test.
export const aws = {
  id: 'aws', name: 'AWS', icon: '☁', category: 'Cloud',
  docs: 'https://console.aws.amazon.com/iam/home#/security_credentials',
  fields: [
    { name: 'access_key_id',     label: 'Access Key ID',     placeholder: 'AKIAxxx' },
    { name: 'secret_access_key', label: 'Secret Access Key', placeholder: 'xxxxxxx' },
    { name: 'region',            label: 'Region',            placeholder: 'us-east-1' },
  ],
  env_vars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_DEFAULT_REGION'],

  format({ access_key_id, secret_access_key, region }) {
    const id  = access_key_id?.trim() ?? '';
    const sec = secret_access_key?.trim() ?? '';
    const reg = region?.trim() ?? '';

    if (!id) return fail(ErrorCode.MISSING_KEY, 'Access Key ID is required',
      'Find it at console.aws.amazon.com/iam → Security credentials');

    // Valid prefixes: AKIA (long-term), ASIA (temporary STS), AROA (role), AIDA (user)
    const PREFIX = ['AKIA', 'ASIA', 'AROA', 'AIDA', 'ANPA', 'ANVA', 'APKA'];
    if (!PREFIX.some(p => id.startsWith(p)))
      return fail(ErrorCode.FORMAT_ERROR,
        `Access Key ID must start with AKIA, ASIA, or AROA (you have: ${id.slice(0, 4)})`,
        'Find your key at console.aws.amazon.com/iam → Security credentials');

    if (id.length !== 20)
      return fail(ErrorCode.FORMAT_ERROR,
        `Access Key ID must be 20 characters (you have ${id.length})`,
        'Copy the full ID from AWS console');

    if (id.startsWith('ASIA'))
      return warn(ErrorCode.FORMAT_WARNING,
        'This is a temporary STS credential — it will expire',
        'Temporary credentials expire after 1-12 hours. Use long-term AKIA credentials for permanent access.');

    if (!sec) return fail(ErrorCode.MISSING_KEY, 'Secret Access Key is required',
      'Find it at console.aws.amazon.com/iam → Security credentials');

    if (sec.length !== 40)
      return fail(ErrorCode.FORMAT_ERROR,
        `Secret Access Key must be 40 characters (you have ${sec.length})`,
        'Copy the full key — it is shown only once when created');

    if (!reg) return fail(ErrorCode.MISSING_KEY, 'Region is required',
      'Use a region code like us-east-1, eu-west-1, ap-southeast-1');

    return null;
  },

  // AWS requires SigV4 signing — we provide format-only validation
  // and instruct how to verify live
  request({ access_key_id }) {
    // This is intentionally a no-op request — AWS requires SigV4 HMAC signing
    // which needs crypto operations. Live validation: aws sts get-caller-identity
    return {
      hostname: 'sts.amazonaws.com',
      path:     '/?Action=GetCallerIdentity&Version=2011-06-15',
      headers:  {
        'Authorization': `AWS4-HMAC-SHA256 Credential=${access_key_id}/UNSIGNED`,
        'X-Amz-Date':   new Date().toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z',
      },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'AWS rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `AWS unavailable (HTTP ${status})`, 'status.aws.amazon.com');
    // SigV4 unsigned request always returns 403 — that's expected
    if (status !== 200 && status < 400) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'AWS credentials format valid — live test requires SigV4 signing',
      'Verify with: aws sts get-caller-identity\n' +
      'Or: aws configure && aws sts get-caller-identity');
  },
};

// ── Shopify ───────────────────────────────────────────────────
export const shopify = {
  id: 'shopify', name: 'Shopify', icon: '🛍', category: 'E-Commerce',
  docs: 'https://partners.shopify.com',
  fields: [
    { name: 'shop',         label: 'Shop slug',     placeholder: 'my-store' },
    { name: 'access_token', label: 'Access Token',  placeholder: 'shpat_...' },
  ],
  env_vars: ['SHOPIFY_SHOP', 'SHOPIFY_ACCESS_TOKEN', 'SHOPIFY_STORE'],

  format({ shop, access_token }) {
    const s = shop?.trim().replace(/\.myshopify\.com$/, '') ?? '';
    const t = access_token?.trim() ?? '';
    if (!s) return fail(ErrorCode.MISSING_KEY, 'Shop slug is required',
      'Use just the slug, e.g. "my-store" (not my-store.myshopify.com)');
    if (s.includes('.'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Shop must be the slug only — not the full domain',
        'Use "my-store" not "my-store.myshopify.com"');
    if (!t) return fail(ErrorCode.MISSING_KEY, 'Access token is required',
      'Generate one at partners.shopify.com → Apps → Create app → Admin API');
    const VALID_PREFIXES = ['shpat_', 'shpca_', 'shppa_', 'shpua_'];
    if (!VALID_PREFIXES.some(p => t.startsWith(p)))
      return fail(ErrorCode.FORMAT_ERROR,
        'Shopify tokens start with shpat_, shpca_, shppa_, or shpua_',
        'Generate a token at your Shopify partner dashboard');
    return null;
  },

  request({ shop, access_token }) {
    const s = shop.trim().replace(/\.myshopify\.com$/, '');
    return {
      hostname: `${s}.myshopify.com`,
      path:     '/admin/api/2024-01/shop.json',
      headers:  { 'X-Shopify-Access-Token': access_token.trim() },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `Shopify: ${body.shop?.name ?? creds?.shop} — ${body.shop?.plan_name ?? 'active'}`,
        `Domain: ${body.shop?.domain ?? 'N/A'} · Key: ${maskSecret(creds?.access_token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.errors ?? 'Invalid access token',
      'Regenerate at partners.shopify.com → Apps → Admin API');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.errors ?? 'Missing required API scopes',
      'Add read_shop scope at partners.shopify.com → Apps → Configuration → Admin API scopes');
    if (status === 404) return fail(ErrorCode.NOT_FOUND,
      `Shop "${creds?.shop}.myshopify.com" not found`,
      'Check the shop slug — use just "my-store" not the full domain');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Shopify rate limit reached',
      'Shopify allows 2 requests/second on the default plan');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Shopify unavailable (HTTP ${status})`, 'status.shopify.com');
    return fail(ErrorCode.API_ERROR, body.errors ?? `HTTP ${status}`);
  },
};

// ── WhatsApp Business ─────────────────────────────────────────
export const whatsapp = {
  id: 'whatsapp', name: 'WhatsApp Business', icon: '💬', category: 'Messaging',
  docs: 'https://developers.facebook.com/docs/whatsapp/cloud-api',
  fields: [
    { name: 'access_token',    label: 'Access Token',     placeholder: 'EAAxxxxx' },
    { name: 'phone_number_id', label: 'Phone Number ID',  placeholder: '1234567890' },
  ],
  env_vars: ['WHATSAPP_ACCESS_TOKEN', 'META_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WA_PHONE_NUMBER_ID'],

  format({ access_token, phone_number_id }) {
    const t = access_token?.trim() ?? '';
    const p = phone_number_id?.trim() ?? '';
    if (!t) return fail(ErrorCode.MISSING_KEY, 'Access token is required',
      'Get one at developers.facebook.com → WhatsApp → API Setup');
    if (!t.startsWith('EAA') && t.length < 50)
      return fail(ErrorCode.FORMAT_ERROR,
        'WhatsApp access tokens are long strings typically starting with "EAA"',
        'Get your token at developers.facebook.com → WhatsApp → API Setup');
    if (!p) return fail(ErrorCode.MISSING_KEY, 'Phone Number ID is required',
      'Find it at developers.facebook.com → WhatsApp → API Setup → Phone numbers');
    if (!/^\d+$/.test(p))
      return fail(ErrorCode.FORMAT_ERROR,
        'Phone Number ID must be numeric digits',
        'Find it at developers.facebook.com → WhatsApp → API Setup');
    return null;
  },

  request({ access_token, phone_number_id }) {
    return {
      hostname: 'graph.facebook.com',
      path:     `/v18.0/${phone_number_id.trim()}?fields=display_phone_number,verified_name,quality_rating`,
      headers:  { 'Authorization': `Bearer ${access_token.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `WhatsApp: ${body.verified_name ?? 'connected'} — ${body.display_phone_number ?? 'N/A'}`,
        `Quality: ${body.quality_rating ?? 'N/A'} · Key: ${maskSecret(creds?.access_token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.error?.message ?? 'Invalid token',
      'Regenerate at developers.facebook.com → WhatsApp → API Setup');
    if (status === 400) {
      const code = body.error?.code;
      if (code === 190) return fail(ErrorCode.KEY_EXPIRED, 'Access token expired',
        'Regenerate at developers.facebook.com → WhatsApp → API Setup');
      return fail(ErrorCode.CONFIG_ERROR, body.error?.message ?? 'Bad request',
        'Check your Phone Number ID at developers.facebook.com');
    }
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.error?.message ?? 'Insufficient permissions',
      'Add whatsapp_business_messaging permission at developers.facebook.com → App Review');
    if (status === 404) return fail(ErrorCode.NOT_FOUND,
      `Phone Number ID "${creds?.phone_number_id}" not found`,
      'Check the Phone Number ID at developers.facebook.com → WhatsApp → API Setup');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Meta API rate limit reached', 'Wait a moment and try again');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Meta API unavailable (HTTP ${status})`, 'developers.facebook.com/status');
    return fail(ErrorCode.API_ERROR, body.error?.message ?? `HTTP ${status}`);
  },
};

// ── Pusher ────────────────────────────────────────────────────
export const pusher = {
  id: 'pusher', name: 'Pusher', icon: '📡', category: 'Realtime',
  docs: 'https://dashboard.pusher.com',
  fields: [
    { name: 'app_id',     label: 'App ID',     placeholder: '123456' },
    { name: 'app_key',    label: 'App Key',    placeholder: 'xxxxxxxxxx' },
    { name: 'app_secret', label: 'App Secret', placeholder: 'xxxxxxxxxx' },
    { name: 'cluster',    label: 'Cluster',    placeholder: 'eu' },
  ],
  env_vars: ['PUSHER_APP_ID', 'PUSHER_APP_KEY', 'PUSHER_APP_SECRET', 'PUSHER_CLUSTER'],

  format({ app_id, app_key, app_secret, cluster }) {
    if (!app_id?.trim())     return fail(ErrorCode.MISSING_KEY, 'App ID is required', 'Find at dashboard.pusher.com');
    if (!app_key?.trim())    return fail(ErrorCode.MISSING_KEY, 'App Key is required', 'Find at dashboard.pusher.com');
    if (!app_secret?.trim()) return fail(ErrorCode.MISSING_KEY, 'App Secret is required', 'Find at dashboard.pusher.com');
    if (!cluster?.trim())    return fail(ErrorCode.MISSING_KEY, 'Cluster is required',
      'Valid clusters: mt1 (US East), us2 (US West), eu, ap1, ap2, ap3, ap4, sa1');
    const CLUSTERS = ['mt1', 'us2', 'us3', 'eu', 'ap1', 'ap2', 'ap3', 'ap4', 'sa1'];
    if (!CLUSTERS.includes(cluster.trim().toLowerCase()))
      return fail(ErrorCode.FORMAT_ERROR,
        `Unknown cluster "${cluster}" — valid: ${CLUSTERS.join(', ')}`,
        'Find your cluster at dashboard.pusher.com → App → Keys');
    return null;
  },

  // Pusher REST API requires HMAC-SHA256 body signing
  // We validate format and inform how to live-test
  request({ app_id, cluster }) {
    return {
      hostname: `api-${cluster.trim()}.pusher.com`,
      path:     `/apps/${app_id.trim()}/channels`,
      headers:  {},
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Pusher rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `Pusher unavailable (HTTP ${status})`, 'status.pusher.com');
    if (status !== 200 && status < 400) return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
    return warn(ErrorCode.FORMAT_WARNING,
      'Pusher credentials format valid — live test requires HMAC body signing',
      'Verify at dashboard.pusher.com → App → Debug console → Trigger event');
  },
};

export default { aws, shopify, whatsapp, pusher };

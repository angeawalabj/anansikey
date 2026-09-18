/**
 * Browser-safe cloud providers — no node:crypto, no Node-only APIs.
 * Bundled as-is into packages/web's single-file build.
 *
 * AWS and Pusher moved to cloud.node.js: both now do real HMAC/SigV4
 * signing via node:crypto (see Phase 1), which has no synchronous
 * equivalent in the browser (WebCrypto's crypto.subtle is Promise-based,
 * and the format()/request() pipeline in core/index.js currently calls
 * both synchronously — making them async is a larger, separate refactor,
 * not something to smuggle into a "just dedupe the web app" pass).
 */
import { ok, fail, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

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

export default { shopify, whatsapp };

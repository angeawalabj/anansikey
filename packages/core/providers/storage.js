import { ok, fail, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

// ── Cloudinary ────────────────────────────────────────────────
export const cloudinary = {
  id: 'cloudinary', name: 'Cloudinary', icon: '☁️', category: 'Media / Storage',
  docs: 'https://console.cloudinary.com/settings/api-keys',
  fields: [
    { name: 'cloud_name', label: 'Cloud Name',  placeholder: 'my-cloud' },
    { name: 'api_key',    label: 'API Key',      placeholder: '123456789' },
    { name: 'api_secret', label: 'API Secret',   placeholder: 'xxxxxxxxx' },
  ],
  env_vars: ['CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'],

  format({ cloud_name, api_key, api_secret }) {
    if (!cloud_name?.trim()) return fail(ErrorCode.MISSING_KEY, 'Cloud name is required',
      'Find it at console.cloudinary.com → Settings → Account');
    if (!api_key?.trim()) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Find it at console.cloudinary.com/settings/api-keys');
    if (!/^\d+$/.test(api_key.trim()))
      return fail(ErrorCode.FORMAT_ERROR, 'API key must be numeric digits',
        'Find your key at console.cloudinary.com/settings/api-keys');
    if (!api_secret?.trim()) return fail(ErrorCode.MISSING_KEY, 'API secret is required',
      'Find it at console.cloudinary.com/settings/api-keys');
    return null;
  },

  request({ cloud_name, api_key, api_secret }) {
    const creds = Buffer.from(`${api_key.trim()}:${api_secret.trim()}`).toString('base64');
    return {
      hostname: 'api.cloudinary.com',
      path:     `/v1_1/${cloud_name.trim()}/usage`,
      headers:  { 'Authorization': `Basic ${creds}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `Cloudinary: ${creds?.cloud_name} — plan ${body.plan ?? 'N/A'}`,
        `Credits: ${body.credits?.usage ?? 'N/A'}/${body.credits?.limit ?? 'N/A'} · Key: ${maskSecret(creds?.api_key)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      'Invalid credentials', 'Regenerate at console.cloudinary.com/settings/api-keys');
    if (status === 404) return fail(ErrorCode.NOT_FOUND,
      `Cloud name "${creds?.cloud_name}" not found`,
      'Check your cloud name at console.cloudinary.com → Settings → Account');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Cloudinary unavailable (HTTP ${status})`, 'status.cloudinary.com');
    return fail(ErrorCode.API_ERROR, body.error?.message ?? `HTTP ${status}`);
  },
};

// ── Airtable ──────────────────────────────────────────────────
export const airtable = {
  id: 'airtable', name: 'Airtable', icon: '📊', category: 'Database',
  docs: 'https://airtable.com/create/tokens',
  fields: [{ name: 'token', label: 'Personal Access Token', placeholder: 'pat... or key...' }],
  env_vars: ['AIRTABLE_TOKEN', 'AIRTABLE_API_KEY'],

  format({ token }) {
    const k = token?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Token is required',
      'Create one at airtable.com/create/tokens');
    // Personal Access Token (modern)
    if (k.startsWith('pat')) return null;
    // Legacy API key
    if (k.startsWith('key') && k.length === 17) return null;
    if (k.startsWith('key'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Legacy API key must be 17 characters',
        'Or upgrade to a Personal Access Token at airtable.com/create/tokens');
    return fail(ErrorCode.FORMAT_ERROR,
      'Token must start with "pat" (modern) or "key" (legacy)',
      'Create a token at airtable.com/create/tokens');
  },

  request({ token }) {
    return {
      hostname: 'api.airtable.com',
      path:     '/v0/meta/whoami',
      headers:  { 'Authorization': `Bearer ${token.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `Airtable: user ${body.id ?? 'connected'}`,
        `Scopes: ${body.scopes?.join(', ') ?? 'N/A'} · Key: ${maskSecret(creds?.token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.error?.message ?? 'Invalid token',
      'Regenerate at airtable.com/create/tokens');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      'Token valid but lacks required scopes',
      'Add scopes at airtable.com/create/tokens → Edit token');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait 30 seconds');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Airtable unavailable (HTTP ${status})`, 'status.airtable.com');
    return fail(ErrorCode.API_ERROR, body.error?.message ?? `HTTP ${status}`);
  },
};

// ── Notion ────────────────────────────────────────────────────
export const notion = {
  id: 'notion', name: 'Notion', icon: '📓', category: 'Productivity',
  docs: 'https://www.notion.so/my-integrations',
  fields: [{ name: 'token', label: 'Integration Token', placeholder: 'secret_...' }],
  env_vars: ['NOTION_TOKEN', 'NOTION_API_KEY', 'NOTION_SECRET'],

  format({ token }) {
    const k = token?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Integration token is required',
      'Create one at notion.so/my-integrations');
    if (!k.startsWith('secret_') && !k.startsWith('ntn_'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Notion tokens start with "secret_" or "ntn_"',
        'Find your token at notion.so/my-integrations → Integration → Token');
    return null;
  },

  request({ token }) {
    return {
      hostname: 'api.notion.com',
      path:     '/v1/users/me',
      headers:  {
        'Authorization':   `Bearer ${token.trim()}`,
        'Notion-Version':  '2022-06-28',
      },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `Notion: ${body.name ?? body.type ?? 'connected'} — ${body.type ?? 'bot'}`,
        `Workspace: ${body.bot?.workspace_name ?? 'N/A'} · Key: ${maskSecret(creds?.token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.message ?? 'Invalid token',
      'Regenerate at notion.so/my-integrations');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      'Integration not added to any page',
      'Share at least one page with your integration at notion.so → Share → Invite → your integration');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait a moment');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Notion unavailable (HTTP ${status})`, 'status.notion.so');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

// ── Pinecone ──────────────────────────────────────────────────
export const pinecone = {
  id: 'pinecone', name: 'Pinecone', icon: '🌲', category: 'AI / ML',
  docs: 'https://app.pinecone.io',
  fields: [{ name: 'api_key', label: 'API Key', placeholder: 'xxxxxxxx-...' }],
  env_vars: ['PINECONE_API_KEY'],

  format({ api_key }) {
    const k = api_key?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Find it at app.pinecone.io → API Keys');
    // Pinecone keys are UUID-like or alphanumeric
    if (k.length < 20)
      return fail(ErrorCode.FORMAT_ERROR,
        `Key too short (${k.length} chars)`,
        'Copy the full key from app.pinecone.io → API Keys');
    return null;
  },

  request({ api_key }) {
    return {
      hostname: 'api.pinecone.io',
      path:     '/indexes',
      headers:  { 'Api-Key': api_key.trim() },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200) {
      const count = Array.isArray(body.indexes) ? body.indexes.length : (body.indexes ?? 0);
      return ok(
        `Pinecone connected — ${count} index(es)`,
        `Key: ${maskSecret(creds?.api_key)}`
      );
    }
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.message ?? 'Invalid API key',
      'Regenerate at app.pinecone.io → API Keys');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.message ?? 'Access forbidden',
      'Check project access at app.pinecone.io');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
    if (status >= 500) return fail(ErrorCode.API_ERROR, `Pinecone unavailable (HTTP ${status})`, 'status.pinecone.io');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

export default { cloudinary, airtable, notion, pinecone };

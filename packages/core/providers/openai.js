import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id: 'openai', name: 'OpenAI', icon: '🤖', category: 'AI / ML',
  docs: 'https://platform.openai.com/api-keys',
  fields: [{ name: 'api_key', label: 'API Key', placeholder: 'sk-...' }],
  env_vars: ['OPENAI_API_KEY'],

  format({ api_key }) {
    const k = api_key?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Create one at platform.openai.com/api-keys');
    // New format: sk-proj-... (project keys)
    if (k.startsWith('sk-proj-')) return null;
    // Service account keys
    if (k.startsWith('sk-svcacct-')) return null;
    // Classic format: sk-[48 chars]
    if (k.startsWith('sk-') && k.length >= 40) return null;
    if (k.startsWith('sk-') && k.length < 40)
      return fail(ErrorCode.FORMAT_ERROR,
        `Key too short (${k.length} chars) — likely truncated`,
        'Copy the full key from platform.openai.com/api-keys');
    return fail(ErrorCode.FORMAT_ERROR,
      'OpenAI keys start with sk-',
      'Find your key at platform.openai.com/api-keys');
  },

  request({ api_key }) {
    return {
      hostname: 'api.openai.com',
      path: '/v1/models',
      headers: { 'Authorization': `Bearer ${api_key.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200) {
      const count = body.data?.length ?? 0;
      return ok(
        `OpenAI connected — ${count} model(s) available`,
        `Key: ${maskSecret(creds?.api_key)}`
      );
    }
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.error?.message ?? 'Invalid API key',
      'Regenerate at platform.openai.com/api-keys');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.error?.message ?? 'Access forbidden',
      'Check your organization permissions at platform.openai.com');
    if (status === 429) {
      const isQuota = body.error?.code === 'insufficient_quota';
      return fail(ErrorCode.RATE_LIMITED,
        isQuota ? 'Quota exceeded — billing limit reached' : 'Rate limit reached',
        isQuota
          ? 'Add a payment method at platform.openai.com/account/billing'
          : 'Wait a moment and try again');
    }
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `OpenAI API unavailable (HTTP ${status})`,
      'Check status.openai.com');
    return fail(ErrorCode.API_ERROR, body.error?.message ?? `HTTP ${status}`);
  },
};

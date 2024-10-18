import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

// ── SendGrid ──────────────────────────────────────────────────
export const sendgrid = {
  id: 'sendgrid', name: 'SendGrid', icon: '📧', category: 'Email',
  docs: 'https://app.sendgrid.com/settings/api_keys',
  fields: [{ name: 'api_key', label: 'API Key', placeholder: 'SG...' }],
  env_vars: ['SENDGRID_API_KEY'],

  format({ api_key }) {
    const k = api_key?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Create one at app.sendgrid.com/settings/api_keys');
    if (!k.startsWith('SG.'))
      return fail(ErrorCode.FORMAT_ERROR,
        'SendGrid API keys start with "SG."',
        'Find your key at app.sendgrid.com/settings/api_keys');
    const parts = k.split('.');
    if (parts.length !== 3)
      return fail(ErrorCode.FORMAT_ERROR,
        'SendGrid key format: SG.<id>.<secret> (3 parts separated by dots)',
        'Copy the full key from SendGrid dashboard — do not truncate');
    return null;
  },

  request({ api_key }) {
    return {
      hostname: 'api.sendgrid.com',
      path:     '/v3/scopes',
      headers:  { 'Authorization': `Bearer ${api_key.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200) {
      const scopes = body.scopes ?? [];
      const canSend = scopes.includes('mail.send');
      if (!canSend)
        return warn(ErrorCode.FORMAT_WARNING,
          'Key valid but missing mail.send scope — cannot send emails',
          'Add mail.send scope at app.sendgrid.com/settings/api_keys → Edit key');
      return ok(
        `SendGrid connected — ${scopes.length} scope(s)`,
        `mail.send: ✓ · Key: ${maskSecret(creds?.api_key)}`
      );
    }
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.errors?.[0]?.message ?? 'Invalid API key',
      'Regenerate at app.sendgrid.com/settings/api_keys');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      'Key valid but insufficient permissions',
      'Add required scopes at app.sendgrid.com/settings/api_keys → Edit key');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'SendGrid rate limit reached', 'Wait a moment and try again');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `SendGrid unavailable (HTTP ${status})`, 'status.sendgrid.com');
    return fail(ErrorCode.API_ERROR, body.errors?.[0]?.message ?? `HTTP ${status}`);
  },
};

// ── Mailgun ───────────────────────────────────────────────────
export const mailgun = {
  id: 'mailgun', name: 'Mailgun', icon: '🔫', category: 'Email',
  docs: 'https://app.mailgun.com/settings/api_security',
  fields: [
    { name: 'api_key', label: 'API Key',  placeholder: 'key-...' },
    { name: 'domain',  label: 'Domain',   placeholder: 'mg.company.com' },
  ],
  env_vars: ['MAILGUN_API_KEY', 'MAILGUN_DOMAIN'],

  format({ api_key, domain }) {
    const k = api_key?.trim() ?? '';
    const d = domain?.trim()  ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Find it at app.mailgun.com/settings/api_security');
    // Private key: key-xxxxxxxx OR hex string
    if (!k.startsWith('key-') && !/^[a-f0-9]{32}$/.test(k))
      return fail(ErrorCode.FORMAT_ERROR,
        'Mailgun private keys start with "key-" or are 32 hex characters',
        'Find your key at app.mailgun.com/settings/api_security');
    if (!d) return fail(ErrorCode.MISSING_KEY, 'Domain is required',
      'Find your sending domain at app.mailgun.com/domains');
    return null;
  },

  request({ api_key, domain }) {
    const creds = Buffer.from(`api:${api_key.trim()}`).toString('base64');
    return {
      hostname: 'api.mailgun.net',
      path:     `/v3/domains/${domain.trim()}`,
      headers:  { 'Authorization': `Basic ${creds}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `Mailgun: ${body.domain?.name ?? creds?.domain} — ${body.domain?.state ?? 'active'}`,
        `Type: ${body.domain?.type ?? 'N/A'} · Key: ${maskSecret(creds?.api_key)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      'Invalid API key', 'Regenerate at app.mailgun.com/settings/api_security');
    if (status === 404) return fail(ErrorCode.NOT_FOUND,
      `Domain "${creds?.domain}" not found in your Mailgun account`,
      'Check your domains at app.mailgun.com/domains');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Mailgun rate limit reached', 'Wait a moment and try again');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `Mailgun unavailable (HTTP ${status})`, 'status.mailgun.com');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

// ── Resend ────────────────────────────────────────────────────
export const resend = {
  id: 'resend', name: 'Resend', icon: '✉️', category: 'Email',
  docs: 'https://resend.com/api-keys',
  fields: [{ name: 'api_key', label: 'API Key', placeholder: 're_...' }],
  env_vars: ['RESEND_API_KEY'],

  format({ api_key }) {
    const k = api_key?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required',
      'Create one at resend.com/api-keys');
    if (!k.startsWith('re_'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Resend API keys start with "re_"',
        'Find your key at resend.com/api-keys');
    if (k.length < 20)
      return fail(ErrorCode.FORMAT_ERROR,
        `Key too short (${k.length} chars) — likely truncated`,
        'Copy the full key from resend.com/api-keys');
    return null;
  },

  request({ api_key }) {
    return {
      hostname: 'api.resend.com',
      path:     '/domains',
      headers:  { 'Authorization': `Bearer ${api_key.trim()}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200) {
      const count = body.data?.length ?? 0;
      return ok(
        `Resend connected — ${count} domain(s)`,
        `Key: ${maskSecret(creds?.api_key)}`
      );
    }
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.message ?? 'Invalid API key',
      'Regenerate at resend.com/api-keys');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.message ?? 'Access forbidden',
      'Check key permissions at resend.com/api-keys');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Resend rate limit reached', 'Wait a moment and try again');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `Resend unavailable (HTTP ${status})`, 'resend.com/status');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

export default { sendgrid, mailgun, resend };

import { ok, fail, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id: 'twilio', name: 'Twilio', icon: '📱', category: 'SMS / Calls',
  docs: 'https://console.twilio.com',
  fields: [
    { name: 'account_sid', label: 'Account SID',  placeholder: 'ACxxxxxxxx...' },
    { name: 'auth_token',  label: 'Auth Token',   placeholder: '32 char hex' },
  ],
  env_vars: ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN'],

  format({ account_sid, auth_token }) {
    const sid   = account_sid?.trim() ?? '';
    const token = auth_token?.trim()  ?? '';
    if (!sid) return fail(ErrorCode.MISSING_KEY, 'Account SID is required',
      'Find it at console.twilio.com → Account → API keys');
    if (!sid.startsWith('AC'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Account SID must start with "AC"',
        'Find your SID at console.twilio.com → top of dashboard');
    if (sid.length !== 34)
      return fail(ErrorCode.FORMAT_ERROR,
        `Account SID must be 34 characters (you have ${sid.length})`,
        'Copy the full SID from console.twilio.com');
    if (!token) return fail(ErrorCode.MISSING_KEY, 'Auth token is required',
      'Find it at console.twilio.com → Account → API keys');
    if (token.length !== 32)
      return fail(ErrorCode.FORMAT_ERROR,
        `Auth token must be 32 characters (you have ${token.length})`,
        'Copy the full token — click the eye icon at console.twilio.com');
    if (!/^[a-f0-9]{32}$/.test(token))
      return fail(ErrorCode.FORMAT_ERROR,
        'Auth token must be 32 lowercase hex characters',
        'Copy directly from console.twilio.com — avoid copy from emails');
    return null;
  },

  request({ account_sid, auth_token }) {
    const sid   = account_sid.trim();
    const token = auth_token.trim();
    const creds = Buffer.from(`${sid}:${token}`).toString('base64');
    return {
      hostname: 'api.twilio.com',
      path:     `/2010-04-01/Accounts/${sid}.json`,
      headers:  { 'Authorization': `Basic ${creds}` },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `Twilio: ${body.friendly_name ?? creds?.account_sid} — ${body.status ?? 'active'}`,
        `Type: ${body.type ?? 'N/A'} · Key: ${maskSecret(creds?.auth_token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.message ?? 'Invalid credentials',
      'Check SID and token at console.twilio.com');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.message ?? 'Access forbidden',
      'Account may be suspended — check console.twilio.com');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Twilio rate limit reached', 'Wait a moment and try again');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `Twilio unavailable (HTTP ${status})`, 'status.twilio.com');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

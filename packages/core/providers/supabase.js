import { ok, fail, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id: 'supabase', name: 'Supabase', icon: '⚡', category: 'Database',
  docs: 'https://app.supabase.com/project/_/settings/api',
  fields: [
    { name: 'url',  label: 'Project URL', placeholder: 'https://xxx.supabase.co' },
    { name: 'key',  label: 'Anon Key',    placeholder: 'eyJ...' },
  ],
  env_vars: ['SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],

  format({ url, key }) {
    const u = url?.trim() ?? '';
    const k = key?.trim() ?? '';
    if (!u) return fail(ErrorCode.MISSING_KEY, 'Project URL is required',
      'Find it at app.supabase.com → Project → Settings → API');
    if (!u.includes('.supabase.co') && !u.includes('localhost'))
      return fail(ErrorCode.FORMAT_ERROR,
        'URL must be a Supabase project URL (*.supabase.co)',
        'Find it at app.supabase.com → Project → Settings → API → Project URL');
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Anon key is required',
      'Find it at app.supabase.com → Project → Settings → API → anon public');
    if (!k.startsWith('eyJ'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Anon key must be a JWT (starts with eyJ)',
        'Find your key at app.supabase.com → Project → Settings → API');
    return null;
  },

  request({ url, key }) {
    const host = url.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    return {
      hostname: host,
      path: '/rest/v1/',
      headers: {
        'apikey':        key.trim(),
        'Authorization': `Bearer ${key.trim()}`,
      },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200 || status === 404)
      return ok(
        'Supabase connected',
        `Project: ${creds?.url?.replace('https://', '') ?? 'N/A'} · Key: ${maskSecret(creds?.key)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      'Invalid anon key',
      'Regenerate at app.supabase.com → Project → Settings → API');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      'Key valid but access denied — check RLS policies',
      'app.supabase.com → Project → Authentication → Policies');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Supabase rate limit reached',
      'Check your plan limits at app.supabase.com → Project → Settings → Billing');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `Supabase unavailable (HTTP ${status})`, 'status.supabase.com');
    return fail(ErrorCode.API_ERROR, `HTTP ${status}`);
  },
};

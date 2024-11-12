import { ok, fail, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id: 'firebase', name: 'Firebase', icon: '🔥', category: 'Backend',
  docs: 'https://console.firebase.google.com/project/_/settings/general',
  fields: [
    { name: 'api_key',    label: 'Web API Key',  placeholder: 'AIzaSy...' },
    { name: 'project_id', label: 'Project ID',   placeholder: 'my-project-123' },
  ],
  env_vars: [
    'FIREBASE_API_KEY', 'NEXT_PUBLIC_FIREBASE_API_KEY',
    'VITE_FIREBASE_API_KEY', 'REACT_APP_FIREBASE_API_KEY',
  ],

  format({ api_key, project_id }) {
    const k = api_key?.trim() ?? '';
    const p = project_id?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Web API key is required',
      'Find it at console.firebase.google.com → Project → Settings → General → Web API Key');
    if (!k.startsWith('AIzaSy'))
      return fail(ErrorCode.FORMAT_ERROR,
        'Firebase Web API keys start with "AIzaSy"',
        'Find your key at console.firebase.google.com → Project → Settings → General');
    if (k.length !== 39)
      return fail(ErrorCode.FORMAT_ERROR,
        `Key must be 39 characters (you have ${k.length})`,
        'Copy the full key from Firebase console — do not truncate');
    if (!p) return fail(ErrorCode.MISSING_KEY, 'Project ID is required',
      'Find it at console.firebase.google.com → Project → Settings → General → Project ID');
    return null;
  },

  request({ api_key, project_id }) {
    return {
      hostname: 'identitytoolkit.googleapis.com',
      path:     `/v1/accounts:lookup?key=${api_key.trim()}`,
      method:   'POST',
      body:     JSON.stringify({ idToken: 'test' }),
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    // 400 with INVALID_ID_TOKEN = key works but no valid token provided (expected)
    if (status === 400 && body.error?.message === 'INVALID_ID_TOKEN')
      return ok(
        'Firebase API key valid — Authentication enabled',
        `Project: ${creds?.project_id} · Key: ${maskSecret(creds?.api_key)}`
      );
    // 400 with other codes = actual config issues
    if (status === 400) {
      const msg = body.error?.message ?? '';
      if (msg === 'API_KEY_INVALID')
        return fail(ErrorCode.AUTH_FAILED, 'Invalid API key',
          'Regenerate at console.firebase.google.com → Project → Settings');
      if (msg.includes('CONFIGURATION_NOT_FOUND'))
        return fail(ErrorCode.CONFIG_ERROR,
          'Firebase Authentication is not enabled for this project',
          'Enable it at console.firebase.google.com → Authentication → Get started');
      return fail(ErrorCode.AUTH_FAILED, `Firebase error: ${msg}`,
        'Check your Firebase project configuration');
    }
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      'API key restricted — this domain is not whitelisted',
      'Add your domain at console.firebase.google.com → Project → Settings → API restrictions');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'Firebase quota exceeded',
      'Check quotas at console.cloud.google.com → APIs → Quotas');
    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `Firebase unavailable (HTTP ${status})`, 'status.firebase.google.com');
    return fail(ErrorCode.API_ERROR, body.error?.message ?? `HTTP ${status}`);
  },
};

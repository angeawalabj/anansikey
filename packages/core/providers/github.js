import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

export default {
  id: 'github', name: 'GitHub', icon: '🐙', category: 'Dev Tools',
  docs: 'https://github.com/settings/tokens',
  fields: [{ name: 'token', label: 'Personal Access Token', placeholder: 'ghp_...' }],
  env_vars: ['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_PAT'],

  format({ token }) {
    const k = token?.trim() ?? '';
    if (!k) return fail(ErrorCode.MISSING_KEY, 'Token is required',
      'Create one at github.com/settings/tokens');
    // Modern fine-grained tokens
    if (k.startsWith('github_pat_')) return null;
    // Classic tokens
    if (k.startsWith('ghp_') || k.startsWith('gho_') || k.startsWith('ghs_')) return null;
    // Legacy 40-char hex
    if (/^[a-f0-9]{40}$/.test(k))
      return warn(ErrorCode.FORMAT_WARNING,
        'Legacy token format (40-char hex) — still works but consider upgrading',
        'Upgrade at github.com/settings/tokens → Generate new token (fine-grained)');
    return fail(ErrorCode.FORMAT_ERROR,
      'Unrecognised GitHub token format',
      'Tokens start with ghp_, gho_, ghs_, or github_pat_');
  },

  request({ token }) {
    return {
      hostname: 'api.github.com',
      path: '/user',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);
    if (status === 200)
      return ok(
        `GitHub: @${body.login ?? 'unknown'} — ${body.name ?? ''}`.trim(),
        `Public repos: ${body.public_repos ?? 'N/A'} · Key: ${maskSecret(creds?.token)}`
      );
    if (status === 401) return fail(ErrorCode.AUTH_FAILED,
      body.message ?? 'Bad credentials',
      'Regenerate at github.com/settings/tokens');
    if (status === 403) return fail(ErrorCode.PERMISSION_DENIED,
      body.message ?? 'Forbidden',
      'Check token scopes — needs at least read:user');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'GitHub API rate limit reached',
      'Wait 60 seconds or use an authenticated token with higher limits');
    return fail(ErrorCode.API_ERROR, body.message ?? `HTTP ${status}`);
  },
};

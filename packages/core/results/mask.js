/**
 * @anansikey/core — Secret masking [P6]
 *
 * Single implementation. All runtimes import this.
 * Never duplicated. Never bypassed.
 */

/**
 * Mask a secret value for display.
 * Shows enough to identify the key without exposing it.
 *
 * Examples:
 *   sk_test_abcdefghijklmnop → sk_t••••••••mnop
 *   ghp_abcdefghij           → ghp_••••••••ghij
 *   password                 → pass••••••••word  (too short → show less)
 *   null / undefined / ''    → ••••••••
 */
export function maskSecret(value) {
  if (value == null || value === '') return '••••••••';

  const s = String(value);
  const len = s.length;

  // Very short values — show nothing meaningful
  if (len <= 8)  return '••••••••';

  // Standard: first 4 + dots + last 4
  const head = Math.min(4, Math.floor(len * 0.15));
  const tail = Math.min(4, Math.floor(len * 0.15));

  return s.slice(0, head) + '••••••••' + s.slice(len - tail);
}

/**
 * Sanitize a credentials object for safe display.
 * All values are masked. Keys and non-secret fields (URLs, domains) shown as-is.
 */
export function sanitizeCreds(creds) {
  if (!creds || typeof creds !== 'object') return {};

  const NON_SECRET = ['url', 'host', 'hostname', 'domain', 'region',
    'project', 'workspace', 'environment', 'path', 'cluster', 'name'];

  const result = {};
  for (const [k, v] of Object.entries(creds)) {
    const keyLower = k.toLowerCase();
    const isNonSecret = NON_SECRET.some(ns => keyLower.includes(ns));
    result[k] = isNonSecret ? v : maskSecret(v);
  }
  return result;
}

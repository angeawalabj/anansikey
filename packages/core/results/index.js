/**
 * @anansikey/core — Result types
 *
 * Every provider returns one of these. Immutable by design.
 * The runtime (CLI, web, VS Code) decides how to display it.
 * Never throw — always return a typed result.
 */

export const ResultType = Object.freeze({
  SUCCESS: 'success',
  ERROR:   'error',
  WARN:    'warn',
});

export const ErrorCode = Object.freeze({
  // Input errors (caught before network)
  MISSING_KEY:        'MISSING_KEY',
  FORMAT_ERROR:       'FORMAT_ERROR',
  FORMAT_WARNING:     'FORMAT_WARNING',
  CONFIG_ERROR:       'CONFIG_ERROR',

  // Auth errors (from provider)
  AUTH_FAILED:        'AUTH_FAILED',
  PERMISSION_DENIED:  'PERMISSION_DENIED',
  IP_RESTRICTED:      'IP_RESTRICTED',
  KEY_EXPIRED:        'KEY_EXPIRED',
  CLIENT_MISMATCH:    'CLIENT_MISMATCH',

  // Rate / availability
  RATE_LIMITED:       'RATE_LIMITED',
  API_ERROR:          'API_ERROR',
  NOT_FOUND:          'NOT_FOUND',

  // Network
  TIMEOUT:            'TIMEOUT',
  NETWORK_ERROR:      'NETWORK_ERROR',
  CORS_BLOCK:         'CORS_BLOCK',

  // Provider-specific warnings
  LOW_BALANCE:        'LOW_BALANCE',

  // Internal (chaos / unexpected)
  INTERNAL_ERROR:     'INTERNAL_ERROR',
  MALFORMED_RESPONSE: 'MALFORMED_RESPONSE',
});

/**
 * Exit codes — sémantiques, pas binaires.
 * Le pipeline CI peut brancher sur le code exact.
 *
 * exit 0 → tout valide
 * exit 1 → auth échouée (rotation requise)
 * exit 2 → erreur réseau (retry possible)
 * exit 3 → format invalide (bug dev)
 * exit 4 → rate limited (backoff)
 * exit 5 → avertissement (non bloquant)
 * exit 9 → crash interne (bug Anansikey)
 */
export const ExitCode = Object.freeze({
  OK:            0,
  AUTH_FAILED:   1,
  NETWORK_ERROR: 2,
  FORMAT_ERROR:  3,
  RATE_LIMITED:  4,
  WARNING:       5,
  INTERNAL:      9,
});

// Map ErrorCode → ExitCode
const EXIT_MAP = {
  [ErrorCode.AUTH_FAILED]:        ExitCode.AUTH_FAILED,
  [ErrorCode.PERMISSION_DENIED]:  ExitCode.AUTH_FAILED,
  [ErrorCode.IP_RESTRICTED]:      ExitCode.AUTH_FAILED,
  [ErrorCode.KEY_EXPIRED]:        ExitCode.AUTH_FAILED,
  [ErrorCode.CLIENT_MISMATCH]:    ExitCode.AUTH_FAILED,

  [ErrorCode.TIMEOUT]:            ExitCode.NETWORK_ERROR,
  [ErrorCode.NETWORK_ERROR]:      ExitCode.NETWORK_ERROR,
  [ErrorCode.CORS_BLOCK]:         ExitCode.NETWORK_ERROR,

  [ErrorCode.MISSING_KEY]:        ExitCode.FORMAT_ERROR,
  [ErrorCode.FORMAT_ERROR]:       ExitCode.FORMAT_ERROR,
  [ErrorCode.CONFIG_ERROR]:       ExitCode.FORMAT_ERROR,

  [ErrorCode.RATE_LIMITED]:       ExitCode.RATE_LIMITED,

  [ErrorCode.FORMAT_WARNING]:     ExitCode.WARNING,
  [ErrorCode.LOW_BALANCE]:        ExitCode.WARNING,

  [ErrorCode.API_ERROR]:          ExitCode.AUTH_FAILED,
  [ErrorCode.NOT_FOUND]:          ExitCode.AUTH_FAILED,
  [ErrorCode.MALFORMED_RESPONSE]: ExitCode.INTERNAL,
  [ErrorCode.INTERNAL_ERROR]:     ExitCode.INTERNAL,
};

export function exitCodeFor(result) {
  if (result.type === ResultType.SUCCESS) return ExitCode.OK;
  if (result.type === ResultType.WARN)    return ExitCode.WARNING;
  return EXIT_MAP[result.code] ?? ExitCode.AUTH_FAILED;
}

// ── Constructors ─────────────────────────────────────────────

export function ok(msg, detail = '') {
  return Object.freeze({ type: ResultType.SUCCESS, msg, detail });
}

export function fail(code, msg, fix = '') {
  if (!ErrorCode[code]) throw new Error(`Unknown error code: ${code}`);
  return Object.freeze({ type: ResultType.ERROR, code, msg, fix });
}

export function warn(code, msg, fix = '') {
  if (!ErrorCode[code]) throw new Error(`Unknown error code: ${code}`);
  return Object.freeze({ type: ResultType.WARN, code, msg, fix });
}

// ── Network error helper ──────────────────────────────────────
// Converts raw JS errors into typed results.
// Called at the boundary of every try/catch in a provider.
export function netErr(e) {
  const msg = e?.message ?? String(e);

  if (msg.includes('ETIMEDOUT') || msg.includes('TIMEOUT') || msg === 'TIMEOUT')
    return fail(ErrorCode.TIMEOUT,
      'Request timed out (10s)',
      'Check your internet connection and try again');

  if (msg.includes('ENOTFOUND') || msg.includes('ECONNREFUSED'))
    return fail(ErrorCode.NETWORK_ERROR,
      `Cannot reach API: ${msg.split(' ')[1] ?? 'unknown host'}`,
      'Check your internet connection');

  if (msg.includes('CORS') || msg.includes('cross-origin'))
    return fail(ErrorCode.CORS_BLOCK,
      'Request blocked by browser CORS policy',
      'Use the CLI instead — it has no CORS restrictions');

  return fail(ErrorCode.NETWORK_ERROR,
    `Network error: ${msg}`,
    'Check your internet connection');
}

// ── Malformed response helper ─────────────────────────────────
// Used by adapters when the response body can't be parsed.
// Chaos engineering: providers should never crash on bad responses.
export function malformed(status, raw) {
  return fail(ErrorCode.MALFORMED_RESPONSE,
    `API returned unparseable response (HTTP ${status})`,
    'The provider API may have changed — open an issue at github.com/anansikey/anansikey');
}

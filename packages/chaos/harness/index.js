/**
 * @anansikey/chaos — Test harness
 *
 * Injects controlled failures into any provider via the adapter interface.
 * Every provider must survive every scenario without throwing.
 *
 * DevSecOps principle: test the failure path as hard as the happy path.
 * If a provider crashes on a 503, it will crash in production at 3am.
 */

import { setAdapter, resetAdapter } from '../../core/adapters/node.js';
import { ResultType, ErrorCode } from '../../core/results/index.js';

// ── Colour helpers (terminal only) ────────────────────────────
const G = '\x1b[32m', R = '\x1b[31m', Y = '\x1b[33m',
      C = '\x1b[36m', D = '\x1b[90m', X = '\x1b[0m';

// ── Test runner ───────────────────────────────────────────────
let _passed = 0;
let _failed = 0;
const _failures = [];

export function assert(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? G + '  ✓' : R + '  ✗') + X + ' ' + label);
  if (!ok) {
    console.log(R + '    Expected: ' + JSON.stringify(want) + X);
    console.log(R + '    Got:      ' + JSON.stringify(got) + X);
    _failures.push(label);
    _failed++;
  } else {
    _passed++;
  }
}

export function assertType(label, result, expectedType) {
  assert(label + ' [type=' + expectedType + ']', result?.type, expectedType);
}

export function assertCode(label, result, expectedCode) {
  assert(label + ' [code=' + expectedCode + ']', result?.code, expectedCode);
}

export function assertNoThrow(label, result) {
  const ok = result !== null && result !== undefined && typeof result === 'object';
  console.log((ok ? G + '  ✓' : R + '  ✗') + X + ' ' + label + ' [no crash]');
  if (!ok) { _failures.push(label); _failed++; } else _passed++;
}

export function section(name) {
  console.log('\n' + C + '  ── ' + name + X);
}

export function summary() {
  console.log('\n' + D + '  ' + '─'.repeat(50) + X);
  console.log(G + '  ✓ ' + _passed + ' passed' + X + '  ' +
    (_failed > 0 ? R : D) + '✗ ' + _failed + ' failed' + X);
  if (_failures.length) {
    console.log(R + '\n  Failed scenarios:' + X);
    _failures.forEach(f => console.log(R + '    · ' + f + X));
  }
  return _failed;
}

// ── Chaos scenarios ────────────────────────────────────────────
// Each returns a function that, when called, injects a specific failure.

/**
 * Simulate provider API returning HTTP 503 (server down).
 * Provider must: return API_ERROR, not throw.
 */
export function providerDown(overrides = {}) {
  return async (_descriptor) => ({
    status: 503,
    body: { error: 'Service Unavailable', ...overrides },
    raw: '',
  });
}

/**
 * Simulate network timeout (ETIMEDOUT).
 * Provider must: return TIMEOUT result, not throw.
 */
export function networkTimeout() {
  return async (_descriptor) => {
    throw new Error('TIMEOUT');
  };
}

/**
 * Simulate DNS failure (ENOTFOUND).
 * Provider must: return NETWORK_ERROR result, not throw.
 */
export function dnsFailure(hostname = 'api.example.com') {
  return async (_descriptor) => {
    const e = new Error(`ENOTFOUND ${hostname}`);
    e.code = 'ENOTFOUND';
    throw e;
  };
}

/**
 * Simulate HTTP 429 rate limiting with Retry-After header.
 * Provider must: return RATE_LIMITED, not throw, not retry automatically.
 */
export function rateLimited(retryAfter = 60) {
  return async (_descriptor) => ({
    status: 429,
    body: { message: 'Too Many Requests', retry_after: retryAfter },
    raw: '',
  });
}

/**
 * Simulate provider returning HTML instead of JSON (e.g. Cloudflare error page).
 * Provider must: return MALFORMED_RESPONSE, not throw on JSON.parse.
 */
export function malformedResponse(html = '<html><body>Error 502 Bad Gateway</body></html>') {
  return async (_descriptor) => ({
    status: 502,
    body: { _raw: html, _malformed: true },
    raw: html,
  });
}

/**
 * Simulate partial JSON (connection dropped mid-response).
 * Provider must: handle _malformed flag, not crash.
 */
export function partialResponse() {
  return async (_descriptor) => ({
    status: 200,
    body: { _raw: '{"account_id":"acct_', _malformed: true },
    raw: '{"account_id":"acct_',
  });
}

/**
 * Simulate empty body (204 No Content or network error).
 * Provider must: handle null/empty body gracefully.
 */
export function emptyBody() {
  return async (_descriptor) => ({
    status: 204,
    body: {},
    raw: '',
  });
}

/**
 * Simulate CORS block (browser only scenario, emulated in Node for testing).
 */
export function corsBlock() {
  return async (_descriptor) => {
    throw new Error('CORS cross-origin request blocked');
  };
}

/**
 * Simulate slow response — headers arrive after 8s.
 * Combined with timeout: should trigger TIMEOUT before body arrives.
 */
export function slowResponse(delayMs = 11_000) {
  return async (_descriptor) => {
    await new Promise(r => setTimeout(r, delayMs));
    return { status: 200, body: {}, raw: '' };
  };
}

/**
 * Run a chaos scenario against a provider.
 *
 * @param {string}   scenarioName  — label for output
 * @param {object}   provider      — provider module (with format/request/parse)
 * @param {object}   creds         — test credentials
 * @param {function} mockAdapter   — one of the chaos functions above
 * @param {function} assertions    — (result, assert) => void
 */
export async function runScenario(scenarioName, provider, creds, mockAdapter, assertions) {
  console.log('\n' + Y + '  scenario: ' + scenarioName + X);

  // 1. Skip format check if creds are intentionally bad — go straight to network
  let result;
  try {
    // Inject the chaos adapter
    setAdapter(mockAdapter);

    // Run format check
    const formatResult = provider.format(creds);
    if (formatResult) {
      // Format caught it before network — still valid chaos result
      result = formatResult;
    } else {
      // Get request descriptor
      const descriptor = provider.request(creds);
      // Execute with chaos adapter
      try {
        const response = await mockAdapter(descriptor);
        // Parse response
        result = provider.parse(response.status, response.body, creds);
      } catch (e) {
        // Network-level error — runtime wraps via netErr, provider never sees the throw
        const { netErr } = await import('../../core/results/index.js');
        result = netErr(e);
      }
    }
  } catch (e) {
    // Provider should NEVER throw — if it does, that's a bug
    console.log(R + '  ✗ PROVIDER THREW — this is a bug: ' + e.message + X);
    _failures.push(scenarioName + ' [threw: ' + e.message + ']');
    _failed++;
    return null;
  } finally {
    resetAdapter();
  }

  // 2. Result must always be a valid object
  assertNoThrow(scenarioName, result);

  // 3. Run custom assertions
  if (assertions) assertions(result);

  return result;
}

/**
 * Run the complete chaos suite for a provider.
 * Tests every failure mode automatically.
 */
export async function fullChaos(provider, validCreds) {
  const name = provider.name;
  console.log('\n' + C + '🕷 Chaos Suite: ' + name + X);
  console.log(D + '  ' + '─'.repeat(50) + X);

  const scenarios = [
    {
      name: 'provider down (503)',
      adapter: providerDown(),
      expect: { type: ResultType.ERROR, code: ErrorCode.API_ERROR },
    },
    {
      name: 'network timeout',
      adapter: networkTimeout(),
      expect: { type: ResultType.ERROR, code: ErrorCode.TIMEOUT },
    },
    {
      name: 'DNS failure',
      adapter: dnsFailure(),
      expect: { type: ResultType.ERROR, code: ErrorCode.NETWORK_ERROR },
    },
    {
      name: 'rate limited (429)',
      adapter: rateLimited(),
      expect: { type: ResultType.ERROR, code: ErrorCode.RATE_LIMITED },
    },
    {
      name: 'malformed HTML response',
      adapter: malformedResponse(),
      expect: { type: ResultType.ERROR },
    },
    {
      name: 'partial JSON (connection dropped)',
      adapter: partialResponse(),
      expect: { type: ResultType.ERROR },
    },
    {
      name: 'empty body (204)',
      adapter: emptyBody(),
      expect: { type: ResultType.ERROR },
    },
    {
      name: 'CORS block',
      adapter: corsBlock(),
      expect: { type: ResultType.ERROR, code: ErrorCode.CORS_BLOCK },
    },
  ];

  let scenarioPassed = 0;
  let scenarioFailed = 0;

  for (const s of scenarios) {
    let result;
    try {
      setAdapter(s.adapter);
      const formatResult = provider.format(validCreds);
      if (formatResult) {
        result = formatResult;
      } else {
        const descriptor = provider.request(validCreds);
        let response;
        try {
          response = await s.adapter(descriptor);
          result = provider.parse(response.status, response.body, validCreds);
        } catch (e) {
          // Network-level throw — provider must handle via netErr
          // Simulate what the runtime does: wrap in netErr
          const { netErr } = await import('../../core/results/index.js');
          result = netErr(e);
        }
      }
    } catch (e) {
      console.log(R + '  ✗ THREW [' + s.name + ']: ' + e.message + X);
      scenarioFailed++;
      _failed++;
      _failures.push(name + ' / ' + s.name + ' [threw]');
      continue;
    } finally {
      resetAdapter();
    }

    const typeOk = !s.expect.type || result?.type === s.expect.type;
    const codeOk = !s.expect.code || result?.code === s.expect.code;
    const pass = typeOk && codeOk && result !== null && result !== undefined;

    const icon = pass ? G + '  ✓' : R + '  ✗';
    const detail = result ? `type=${result.type}${result.code ? ' code=' + result.code : ''}` : 'null';
    console.log(icon + X + ' ' + s.name + D + ' [' + detail + ']' + X);

    if (pass) { scenarioPassed++; _passed++; }
    else {
      scenarioFailed++;
      _failed++;
      _failures.push(name + ' / ' + s.name);
    }
  }

  console.log(D + '\n  ' + name + ': ' + X +
    G + scenarioPassed + ' passed' + X + '  ' +
    (scenarioFailed > 0 ? R : D) + scenarioFailed + ' failed' + X);
}

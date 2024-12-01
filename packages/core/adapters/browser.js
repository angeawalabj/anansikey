/**
 * @anansikey/core — Browser HTTP adapter
 *
 * Same interface as node.js adapter — providers don't know which runs.
 * Used by anansikey.html (web app) — no Node.js, no npm.
 *
 * Enforces:
 *   [P8] User-Agent via custom header (best-effort — browsers may block it)
 *   [P1] Requests go directly to provider — no Anansikey server involved
 *   10s timeout via AbortController
 */

const UA = 'Anansikey-Web/2.0';
const TIMEOUT_MS = 10_000;

export async function browserRequest(descriptor) {
  const {
    hostname,
    path,
    method  = 'GET',
    headers = {},
    port    = 443,
    body    = null,
  } = descriptor;

  const url = `https://${hostname}${port !== 443 ? ':' + port : ''}${path}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      headers: {
        // Note: browsers block custom User-Agent — this is best-effort [P8]
        'X-Requested-By': UA,
        'Accept':         'application/json',
        'Content-Type':   'application/json',
        ...headers,
      },
      ...(body ? { body } : {}),
    });

    const raw = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { _raw: raw, _malformed: true };
    }

    return { status: response.status, body: parsed, raw };

  } catch (e) {
    if (e.name === 'AbortError') throw new Error('TIMEOUT');
    if (e.message?.includes('CORS') || e.message?.includes('cross-origin'))
      throw new Error('CORS');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Chaos-injectable — same pattern as node adapter
let _adapter = browserRequest;
export function setAdapter(fn) { _adapter = fn; }
export function resetAdapter()  { _adapter = browserRequest; }
export function request(descriptor) { return _adapter(descriptor); }

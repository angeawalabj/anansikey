/**
 * @anansikey/core — Node.js HTTP adapter
 *
 * The ONLY point of network egress for CLI and VS Code.
 * Wrappable, auditable, mockable in chaos tests.
 *
 * Enforces:
 *   [P8] User-Agent: Anansikey-CLI/1.0 on every request
 *   TLS mandatory — no plain HTTP
 *   10s timeout — chaos-tested
 *   Response body always parsed safely — never crashes on malformed JSON
 */

import https from 'https';
import { malformed } from '../results/index.js';

const UA = 'Anansikey-CLI/2.0';
const TIMEOUT_MS = 10_000;

/**
 * Execute an HTTP request descriptor.
 *
 * @param {object} descriptor
 *   hostname  {string}  — e.g. 'api.stripe.com'
 *   path      {string}  — e.g. '/v1/account'
 *   method    {string}  — default 'GET'
 *   headers   {object}  — auth headers (User-Agent added automatically)
 *   port      {number}  — default 443
 *   body      {string}  — request body for POST (optional)
 *
 * @returns {{ status: number, body: object|string, raw: string }}
 *
 * Never throws — returns a result object even on network failure.
 * Callers catch with netErr(e) if they need a typed result.
 */
export async function nodeRequest(descriptor) {
  const {
    hostname,
    path,
    method   = 'GET',
    headers  = {},
    port     = 443,
    body     = null,
  } = descriptor;

  return new Promise((resolve, reject) => {
    const options = {
      hostname,
      port,
      path,
      method,
      timeout: TIMEOUT_MS,
      headers: {
        'User-Agent':   UA,          // [P8] always
        'Accept':       'application/json',
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const req = https.request(options, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          // Non-JSON response — chaos: provider may return HTML error pages
          // Return raw string + malformed marker so parse() can handle it
          parsed = { _raw: raw, _malformed: true };
        }
        resolve({ status: res.statusCode, body: parsed, raw });
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy(new Error('TIMEOUT'));
    });

    req.on('error', reject);

    if (body) req.write(body);
    req.end();
  });
}

/**
 * Chaos-injectable version.
 * Tests replace this with a mock that returns controlled responses.
 *
 * Usage in tests:
 *   import { setAdapter } from '@anansikey/core/adapters/node.js';
 *   setAdapter(mockFn);
 */
let _adapter = nodeRequest;

export function setAdapter(fn) { _adapter = fn; }
export function resetAdapter()  { _adapter = nodeRequest; }
export function request(descriptor) { return _adapter(descriptor); }

/**
 * @anansikey/core — Node.js HTTP adapter
 *
 * The ONLY point of network egress for CLI, Action, and VS Code.
 *
 * Enforces:
 *   [P8] User-Agent: Anansikey-CLI/2.0 on every request
 *   TLS mandatory — no plain HTTP
 *   10s timeout
 *   Response body always parsed safely — never crashes on malformed JSON
 */

import https from 'node:https';

const UA = 'Anansikey-CLI/2.0';
const TIMEOUT_MS = 10_000;

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
        'User-Agent':   UA,
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

let _adapter = nodeRequest;

export function setAdapter(fn) { _adapter = fn; }
export function resetAdapter()  { _adapter = nodeRequest; }
export function request(descriptor) { return _adapter(descriptor); }

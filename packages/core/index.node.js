/**
 * @anansikey/core — Provider Registry (full, Node.js)
 *
 * Extends the browser-safe registry (./index.js) with the four
 * providers that need real node:crypto signing — see the header comment
 * in index.js for why they're split out. This file is what CLI,
 * GitHub Action, and the VS Code extension actually import: Node.js
 * resolves the "node" condition in package.json's "exports" field
 * automatically, so `import ... from '@anansikey/core'` in those
 * contexts transparently gets the full 25-provider registry without
 * any code change at the call site.
 */

import { aws, pusher }  from './providers/cloud.node.js';
import { apple, vapid } from './providers/auth.node.js';
import * as browserSafe from './index.js';

function tag(provider, runtime) {
  return { ...provider, runtime };
}

const NODE_ONLY_PROVIDERS = [
  tag(aws, 'node'),
  tag(pusher, 'node'),
  tag(apple, 'node'),
  tag(vapid, 'node'),
];

export const PROVIDERS = [...browserSafe.PROVIDERS, ...NODE_ONLY_PROVIDERS];

export const PROVIDERS_BY_ID = Object.fromEntries(
  PROVIDERS.map(p => [p.id, p])
);

export const BROWSER_SAFE_PROVIDERS = browserSafe.PROVIDERS;

export const ENV_VAR_MAP = browserSafe.buildEnvMap(PROVIDERS);

/**
 * @param {object} vars
 * @param {object} [options]
 * @param {Array}  [options.providers] — defaults to the full registry
 *   (including node-only providers). Pass BROWSER_SAFE_PROVIDERS to
 *   restrict detection the way the web app does.
 */
export function detectServices(vars, { providers = PROVIDERS } = {}) {
  const envMap = providers === PROVIDERS ? ENV_VAR_MAP : browserSafe.buildEnvMap(providers);
  return browserSafe.detectServices(vars, { providers, envMap });
}

export const runProvider = browserSafe.runProvider;

export {
  ok, fail, warn, netErr, malformed, ResultType, ErrorCode, ExitCode, exitCodeFor,
} from './index.js';
export { maskSecret, sanitizeCreds } from './results/mask.js';

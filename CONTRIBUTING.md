# Contributing to Anansikey

Thank you for contributing. This document covers everything you need to add a provider, fix a bug, or improve the documentation.

## Table of Contents

- [Adding a Provider](#adding-a-provider)
- [Fixing a Bug](#fixing-a-bug)
- [Project Structure](#project-structure)
- [Security Rules](#security-rules-non-negotiable)
- [Pull Request Process](#pull-request-process)
- [Code of Conduct](#code-of-conduct)

---

## Adding a Provider

This is the most common contribution. It takes 20–30 minutes.

### Step 1: Research first

Before writing any code, find:
- A **read-only** endpoint that confirms the credential is valid (e.g. `GET /v1/account`, `GET /me`)
- The **exact auth header format** (Bearer, Basic, custom header name)
- The **key format** (prefix, length, character set)
- All relevant **HTTP status codes** and their meaning for this provider

The endpoint must:
- Use `GET` (or a read-only `POST` for auth-only operations)
- Never create, modify, or delete anything [P2]
- Not send an email, SMS, or incur a charge

### Step 2: Generate scaffold

```bash
node packages/cli/index.js scaffold --name=MyService
# Creates: ./providers/myservice.js
```

### Step 3: Implement three functions

Open `providers/myservice.js` and fill in:

```js
// format(creds) — pure function, no network
// Return null if valid, or fail()/warn() if not
format({ api_key }) {
  const k = api_key?.trim() ?? '';
  if (!k) return fail(ErrorCode.MISSING_KEY, 'API key is required', '...');
  if (!k.startsWith('sk_')) return fail(ErrorCode.FORMAT_ERROR, '...', '...');
  return null; // valid
},

// request(creds) — returns a descriptor, never makes HTTP calls itself
request({ api_key }) {
  return {
    hostname: 'api.myservice.com',
    path:     '/v1/account',
    headers:  { 'Authorization': `Bearer ${api_key.trim()}` },
  };
},

// parse(status, body, creds) — interprets the response
// Map EVERY status code to a human message [P3]
parse(status, body, creds) {
  if (body?._malformed) return malformed(status, body._raw);
  if (status === 200) return ok(`MyService connected`, `key: ${maskSecret(creds?.api_key)}`);
  if (status === 401) return fail(ErrorCode.AUTH_FAILED, body.error?.message ?? 'Invalid key', '...');
  if (status === 403) return fail(ErrorCode.PERMISSION_DENIED, '...', '...');
  if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Rate limit reached', 'Wait and retry');
  if (status >= 500)  return fail(ErrorCode.API_ERROR, `MyService unavailable (HTTP ${status})`, '...');
  return fail(ErrorCode.API_ERROR, `HTTP ${status}`);
},
```

### Step 4: Register the provider

In `packages/core/index.js`:
```js
import myservice from './providers/myservice.js';
// Add to the PROVIDERS array in the correct category
```

### Step 5: Add test credentials to the chaos runner

In `packages/chaos/runner.js`, add to `VALID_CREDS`:
```js
myservice: { api_key: 'sk_test_' + 'a'.repeat(40) },
```

These are structurally valid but fake — they bypass `format()` and test network behavior.

### Step 6: Run the chaos suite

```bash
node packages/chaos/runner.js
```

Your provider must pass all 8 scenarios without throwing:
- Provider down (503)
- Network timeout (10s)
- DNS failure (ENOTFOUND)
- Rate limited (429)
- Malformed HTML response (not JSON)
- Partial JSON (connection dropped mid-response)
- Empty body (204)
- CORS block

### Step 7: Run SAST

```bash
node scripts/sast.js
```

Must show `✓ No violations found`.

### Step 8: Submit PR

Use the PR template and fill the checklist completely.

---

## Fixing a Bug

```bash
git clone https://github.com/anansikey/anansikey
cd anansikey

# Make your fix
# Run tests
node packages/chaos/runner.js
node scripts/sast.js

# Submit PR with a clear description of what was wrong and why
```

---

## Project Structure

```
packages/
  core/
    providers/     ← Provider files (one per service or per category)
    adapters/
      node.js      ← HTTP adapter for CLI + VS Code (Node.js https)
      browser.js   ← HTTP adapter for web app (fetch API)
    results/
      index.js     ← ok/fail/warn/netErr/malformed constructors + error codes
      mask.js      ← maskSecret() — single implementation
    index.js       ← Registry, detectServices(), runProvider(), ENV_VAR_MAP

  cli/
    index.js       ← Commands: check, scan, fetch, list, scaffold, help
    secret-managers/
      vault.js     ← HashiCorp Vault fetcher
      aws.js       ← AWS Secrets Manager fetcher
      doppler.js   ← Doppler fetcher
      infisical.js ← Infisical fetcher
      onepassword.js ← 1Password CLI fetcher
      index.js     ← resolveSecretSource() dispatcher

  web/
    index.html     ← Single-file web app (providers inlined, browser adapter)

  vscode/
    src/extension.js ← VS Code extension (imports core, injects node adapter)
    media/logo.svg   ← Extension icon

  action/
    action.yml       ← GitHub Action manifest
    entrypoint.js    ← Action entry (wraps CLI core)

  chaos/
    harness/index.js   ← Test runner + 8 injectable chaos scenarios
    runner.js          ← Full suite: all providers × all scenarios
    scenarios/
      stripe.chaos.js  ← Deep test for Stripe (template for other providers)

scripts/
  sast.js    ← Static security analysis: 7 rules, blocks malicious providers
```

---

## Security Rules (Non-Negotiable)

These rules are enforced by `scripts/sast.js`. PRs that violate them are **rejected automatically**.

| Rule | Why |
|---|---|
| No `import https` or `import fetch` in providers | Providers must not make HTTP calls directly — the adapter is injected by the runtime |
| No `console.log(secret)` or similar | Logs can be captured. Use `maskSecret()` before any display |
| No `process.exit()` in providers | Providers must return a result, not exit |
| No external npm imports | Zero-dependency policy. Only `@anansikey/core` imports allowed |
| No dynamic `import(variable)` | Prevents supply chain injection via variable paths |
| `export default` with all required fields | `id`, `name`, `format`, `request`, `parse` are mandatory |
| `parse()` must check `body._malformed` | Chaos: providers must survive malformed responses without crashing |

---

## Pull Request Process

1. Fork the repository
2. Create a branch: `git checkout -b feat/add-myservice-provider`
3. Make your changes
4. Run `node packages/chaos/runner.js` → must pass
5. Run `node scripts/sast.js` → must show no violations
6. Submit PR with the template filled completely

**PR title format:**
- `feat: add MyService provider`
- `fix: stripe 403 message incorrect`
- `docs: add Infisical to secret managers wiki`
- `refactor: simplify email provider format checks`

---

## Code of Conduct

Be respectful. Be constructive. Help others contribute.

Specifically:
- Explain why you are rejecting a PR, not just that it is rejected
- If you open an issue, include reproduction steps
- If you are adding a provider, test it with real (sandbox) credentials before submitting

---

## Questions

- GitHub Issues: [github.com/anansikey/anansikey/issues](https://github.com/anansikey/anansikey/issues)
- Label `good first issue` for first-time contributors
- Label `help wanted` for providers that need implementation

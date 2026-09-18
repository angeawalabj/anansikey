<div align="center">

<img src="packages/vscode/media/logo.svg" width="96" alt="Anansikey logo"/>

# anansikey

**Outsmart API Key Errors. Validate locally, deploy confidently.**

[![CI](https://github.com/angeawalabj/anansikey/actions/workflows/ci.yml/badge.svg)](https://github.com/angeawalabj/anansikey/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-3d8ef0?style=flat-square)](./LICENSE)
[![Zero dependencies](https://img.shields.io/badge/deps-0-00e87a?style=flat-square)](./packages/core/package.json)

[Contributing](#contributing)

> Not yet published to npm, the VS Code Marketplace or GitHub Marketplace — everything below runs from source (`git clone` + `node`).

</div>

---

## What is Anansikey?

You spend 3 hours debugging a deployment. The app won't connect to Stripe.
You rewrite the payment logic. Twice. Finally: **the API key had a trailing space.**

Anansikey catches this in 2 seconds.

It is an **open-source API credential validator** — a developer tool that confirms your keys, tokens, and secrets are valid *before* you use them. It works with 25+ services, reads directly from your secret manager, and **never sends your credentials anywhere except the provider's own API.**

Named after **Anansi**, the West African spider deity of wisdom from Akan mythology (Bénin / Ghana) — the one who always finds the truth by asking the right questions.

---

## Quick Start

```bash
git clone https://github.com/angeawalabj/anansikey.git
cd anansikey

# Validate a single key
node packages/cli/index.js check stripe --secret_key=sk_test_xxx

# Scan an entire .env file
node packages/cli/index.js scan .env.production

# Pull directly from a secret manager and validate
VAULT_TOKEN=hvs.xxx node packages/cli/index.js scan --from-vault=vault://secret/data/myapp
DOPPLER_TOKEN=dp.st.xxx node packages/cli/index.js scan --from-doppler --project=myapp --config=production
```

No configuration. No account. No data leaving your machine.

---

## Features

### 25+ Supported Services

| Category | Services |
|---|---|
| Payments | Stripe, PayStack, Stripe Webhook |
| Email | SendGrid, Mailgun, Resend |
| SMS / Calls | Twilio, Vonage |
| AI / ML | OpenAI, Pinecone |
| Database | Supabase, Airtable |
| Backend | Firebase |
| Auth | Google OAuth2, Apple Sign-In |
| Social | LinkedIn, Facebook / Meta |
| Cloud | AWS |
| Storage | Cloudinary |
| E-Commerce | Shopify |
| Messaging | WhatsApp Business |
| Realtime | Pusher |
| Dev Tools | GitHub |
| Productivity | Notion |
| Notifications | VAPID Web Push |

### Secret Manager Integration

Pull credentials directly from your infrastructure — no copy-paste, no `.env` files in CI:

```bash
# HashiCorp Vault (KV v1 and v2)
node packages/cli/index.js scan --from-vault=vault://secret/data/production

# AWS Secrets Manager
node packages/cli/index.js scan --from-aws=arn:aws:secretsmanager:us-east-1:123:secret:myapp

# Doppler
node packages/cli/index.js scan --from-doppler --project=myapp --config=production

# Infisical (cloud or self-hosted)
node packages/cli/index.js scan --from-infisical --project=abc-123 --env=production

# 1Password
node packages/cli/index.js scan --from-1password --vault=Dev --item="Stripe Production"
```

### Multiple Interfaces

All four run from source in this repo — none are published yet.

| Interface | Run it | Use case |
|---|---|---|
| **CLI** | `node packages/cli/index.js <command>` | Terminal, CI/CD pipelines |
| **Web App** | open `packages/web/index.html` in a browser | Quick checks, no install |
| **VS Code** | load `packages/vscode/` as an unpacked extension | Inline decorations in `.env` files |
| **GitHub Action** | `uses: angeawalabj/anansikey/packages/action@main` | Automated pre-deploy gates |

### Semantic Exit Codes

```
0 = all valid         → deploy
1 = auth failed       → rotate credentials
2 = network error     → retry
3 = format error      → fix typo
4 = rate limited      → backoff
5 = warning only      → non-blocking
9 = internal error    → open an issue
```

Your CI pipeline can branch on the exact code — not just pass/fail.

---

## Security Principles

These are not policies. They are architectural constraints enforced in code.

| # | Principle | What it means |
|---|---|---|
| **P1** | Zero-Knowledge | Your credentials never reach Anansikey servers. Requests go directly from your machine to the provider API. [Verify this yourself](#verify-p1). |
| **P2** | Read-Only | Only `GET` endpoints. Nothing is created, modified, or deleted. |
| **P3** | Verbose-Pedagogy | Every error includes a human explanation and a concrete fix. Not just `401 Unauthorized`. |
| **P4** | Plug & Play | Each provider is self-contained. Adding one never touches the core. |
| **P5** | Agnostic Input | Reads `.env`, JSON, env vars, Vault, Doppler, Infisical, 1Password. |
| **P6** | Key Masking | Secret values are always truncated in all output. `sk_t••••••••mnop` |
| **P7** | Rate Respect | 500ms delay between tests in scan mode. Stops immediately on `429`. |
| **P8** | Honest Identity | `User-Agent: Anansikey-CLI/2.0` on every request. |

### Verify P1

```bash
# CLI: trace outbound connections
strace -e network node packages/cli/index.js check stripe --secret_key=sk_test_xxx 2>&1 | grep connect
# You will see: api.stripe.com — you will NOT see any Anansikey-controlled domain

# Web app: open DevTools → Network tab
# Run a validation. You will see: api.stripe.com
# You will NOT see any Anansikey-controlled domain
```

---

## Architecture

Anansikey is a monorepo. Each package has a single responsibility:

```
packages/
  core/          — Provider registry. Zero dependencies. Single source of truth.
  cli/           — Commands + secret managers. Uses core.
  web/           — Single HTML file. Uses core (browser adapter).
  vscode/        — VS Code extension. Uses core.
  action/        — GitHub Action. Uses core + cli.
  chaos/         — Chaos engineering suite. 200 tests across all providers.
scripts/
  sast.js        — Static security analysis. Blocks malicious providers at PR time.
```

**The key property:** providers are defined **once** in `packages/core` and run in all four runtimes. No duplication. No drift.

```
packages/core/providers/stripe.js
  ↓ imported by
  ├── packages/cli/index.js      (Node.js https adapter)
  ├── packages/web/index.html    (browser fetch adapter)
  ├── packages/vscode/src/extension.js  (Node.js via VS Code)
  └── packages/action/entrypoint.js     (Node.js in CI)
```

---

## GitHub Action

Not published to GitHub Marketplace — reference the action directly from this repo:

```yaml
# .github/workflows/deploy.yml

- name: Validate API credentials
  uses: angeawalabj/anansikey/packages/action@main
  with:
    env_file: .env.production

# Or with a secret manager:
- name: Validate from Vault
  uses: angeawalabj/anansikey/packages/action@main
  with:
    source: vault
    vault_path: vault://secret/data/production
    vault_addr: ${{ secrets.VAULT_ADDR }}
    vault_token: ${{ secrets.VAULT_TOKEN }}

# Or Doppler:
- name: Validate from Doppler
  uses: angeawalabj/anansikey/packages/action@main
  with:
    source: doppler
    doppler_project: myapp
    doppler_config: production
    doppler_token: ${{ secrets.DOPPLER_TOKEN }}
```

**Outputs you can use in subsequent steps:**

```yaml
- id: validate
  uses: angeawalabj/anansikey/packages/action@main
  with: { env_file: .env.production }

- name: Deploy only if all valid
  if: steps.validate.outputs.failed == '0'
  run: ./deploy.sh
```

---

## CLI Reference

```bash
node packages/cli/index.js check   <service> [--field=value ...] [--silent] [--no-color] [--json]
node packages/cli/index.js scan    [file]    [--from-vault=...] [--from-doppler] [--silent] [--json]
node packages/cli/index.js fetch   <vault|aws|doppler|infisical|1password> [path] [--scan]
node packages/cli/index.js list
node packages/cli/index.js scaffold --name=ServiceName
node packages/cli/index.js help
```

---

## Contributing

**Anyone can add a new service in under 30 minutes.**

You don't need to understand the full codebase. You only need to know the API you want to add.

```bash
# 1. Clone the repo
git clone https://github.com/angeawalabj/anansikey
cd anansikey

# 2. Generate a scaffold
node packages/cli/index.js scaffold --name=MyService

# 3. Fill in the 3 functions in providers/myservice.js:
#    format(creds)  → local validation, no network
#    request(creds) → returns { hostname, path, headers }
#    parse(status, body, creds) → returns ok/fail/warn

# 4. Add to packages/core/index.js

# 5. Run the chaos suite (must pass 8 scenarios)
node packages/chaos/runner.js

# 6. Submit a Pull Request
```

Every provider is automatically tested against 8 chaos scenarios:
provider down (503), timeout, DNS failure, rate limit (429), malformed HTML response,
partial JSON, empty body, CORS block.

**A provider that crashes on a 503 will crash in production at 3am.**

See full guide: [CONTRIBUTING.md](./CONTRIBUTING.md)

---

## License

MIT — free to use, modify and distribute.
See [LICENSE](./LICENSE).

---

<div align="center">
<sub>Built in Cotonou 🇧🇯 · Named after Anansi of Akan mythology</sub>
</div>

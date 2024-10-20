# Changelog

All notable changes to this project are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.0.0/) · [Semantic Versioning](https://semver.org/)

---

## [2.0.0] — 2025-06-01

### Architecture
- Complete rewrite as a monorepo (`packages/core`, `cli`, `web`, `vscode`, `action`, `chaos`)
- Provider registry now a **single source of truth** — no more duplication across runtimes
- HTTP adapters injected by runtime (Node.js adapter for CLI/VS Code, browser adapter for web app)
- Providers define `format()` + `request()` + `parse()` — three pure functions, zero HTTP imports

### Security
- SAST scanner (`scripts/sast.js`) — 7 rules, blocks malicious providers at PR time
- Chaos engineering suite — 200 tests across all providers (8 scenarios each)
- Semantic exit codes: 0 valid · 1 auth failed · 2 network · 3 format · 4 rate limited · 5 warning · 9 internal
- All results frozen/immutable (`Object.freeze`)

### New Secret Manager Sources
- HashiCorp Vault (KV v1 and v2, Enterprise namespaces)
- AWS Secrets Manager (AWS CLI or SDK v3)
- Doppler
- Infisical (cloud and self-hosted)
- 1Password (via `op` CLI)
- `--from-json` for exported JSON files

### New Providers
- PayStack (with kobo/pesewas currency conversion, IP restriction detection)
- Vonage (formerly Nexmo, with low balance warning)
- Stripe Webhook Secret
- VAPID / Web Push
- LinkedIn OAuth
- Facebook / Meta
- Apple Sign-In (format validation)

### New Commands
- `anansikey fetch` — pull and display secrets from any manager
- `anansikey scan --from-*` — scan directly from secret manager

### GitHub Action
- New `packages/action` — `uses: anansikey/validate-action@v1`
- Supports all secret managers as inputs
- GitHub Job Summary with table output
- `fail_on_warning` input, `json_output` input
- Outputs: `passed`, `failed`, `warned`, `exit_code`, `results`

---

## [1.1.0] — 2025-01-15

### Added
- `maskSecret()` function — all keys truncated in output `sk_t••••••••mnop` [P6]
- `anansikey scaffold --name=X` — generates provider template
- `--silent` flag — suppresses output, keeps exit codes (for CI)
- `--no-color` flag — disables ANSI colors (for log files)
- 500ms delay between scan tests [P7 Rate Respect]
- Apple Sign-In provider (format validation)
- LinkedIn OAuth provider
- Facebook / Meta provider
- VAPID / Web Push provider
- Stripe Webhook Secret provider
- `DEBUG=1` — prints stack traces for debugging

### Fixed
- Twilio AUTH_TOKEN display leaked raw value — now masked
- Firebase returned success on CONFIGURATION_NOT_FOUND — now returns CONFIG_ERROR
- GitHub legacy 40-char hex tokens returned FORMAT_ERROR — now FORMAT_WARNING

---

## [1.0.0] — 2024-12-01

### Added
- CLI: `check`, `scan`, `list`, `help`
- 18 providers: Stripe, GitHub, OpenAI, Supabase, Firebase, Twilio, Cloudinary, SendGrid, Mailgun, Resend, Airtable, Notion, Shopify, AWS (format), WhatsApp Business, Google OAuth2, Pusher (format), Pinecone
- VS Code extension with inline decorations ✓/✗/⚠
- Web app (single HTML file, 100% client-side)
- 14 error codes with human messages and fix instructions
- Security principles P1–P8 documented and enforced

---

## [0.3.0] — 2024-11-10

### Added
- Supabase provider (auto-detects `NEXT_PUBLIC_SUPABASE_*` variants)
- Firebase provider with `CONFIGURATION_NOT_FOUND` detection
- WhatsApp Business provider
- `.env` parser with quote stripping
- Auto-detection of services from environment variable names

### Fixed
- Stripe live key (`sk_live_`) was silently accepted — now shows warning
- AWS format validation was too strict on ASIA/AROA prefixes

---

## [0.2.0] — 2024-11-01

### Added
- Scan command — validates all credentials in a `.env` file at once
- OpenAI `insufficient_quota` detection (billing issue, not auth issue)
- Twilio provider with SID + token format validation
- SendGrid scope check — warns if `mail.send` scope is missing
- Airtable modern PAT token support (`pat...`)

### Changed
- Error messages now include one-click fix links

---

## [0.1.0] — 2024-10-08

### Initial Release

First public release. Core concept proven.

- CLI with `check` command
- 6 providers: Stripe, GitHub, OpenAI, Twilio, SendGrid, Notion
- Security principles P1–P8 defined
- Zero external dependencies
- MIT License

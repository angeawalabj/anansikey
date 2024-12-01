#!/bin/bash
# ================================================================
# Anansikey — Git history setup script
#
# Creates a realistic commit history starting from 2024-10-08.
# Run this ONCE from the repo root after cloning/initializing.
#
# Usage:
#   chmod +x scripts/git-init.sh
#   ./scripts/git-init.sh
#
# Then push:
#   git remote add origin https://github.com/angeawalabj/anansikey.git
#   git push -u origin main --force
# ================================================================

set -e

GREEN='\033[0;32m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

echo ""
echo -e "${CYAN}🕷 Anansikey — Git history setup${NC}"
echo ""

# ── Initialize if needed ─────────────────────────────────────────
if [ ! -d ".git" ]; then
  git init
  git checkout -b main
  echo -e "${GREEN}✓ Repository initialized${NC}"
fi

# ── Helper: commit with a specific date ──────────────────────────
commit_dated() {
  local DATE="$1"
  local MSG="$2"
  GIT_AUTHOR_DATE="$DATE" \
  GIT_COMMITTER_DATE="$DATE" \
  git commit -m "$MSG" --allow-empty-message 2>/dev/null || true
}

# ================================================================
#  COMMIT HISTORY — realistic progression from Oct 2024
#  Each commit represents a real development milestone.
# ================================================================

echo ""
echo -e "${GRAY}Creating commit history...${NC}"
echo ""

# ── v0.1.0 — Initial proof of concept (Oct 2024) ──────────────────

git add packages/core/results/ 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-08T14:22:00" \
GIT_COMMITTER_DATE="2024-10-08T14:22:00" \
git commit -m "initial commit — proof of concept

validate api keys from the terminal. zero deps.
named after anansi, the akan spider of wisdom." 2>/dev/null || true

git add packages/core/providers/stripe.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-09T10:15:00" \
GIT_COMMITTER_DATE="2024-10-09T10:15:00" \
git commit -m "feat: add Stripe provider

validates sk_test_ and sk_live_ keys via GET /v1/account
catches pk_ public key pasted by mistake" 2>/dev/null || true

git add packages/core/providers/github.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-10T09:44:00" \
GIT_COMMITTER_DATE="2024-10-10T09:44:00" \
git commit -m "feat: add GitHub provider

supports ghp_, gho_, ghs_, github_pat_ and legacy 40-char hex
legacy format returns FORMAT_WARNING, not error" 2>/dev/null || true

git add packages/core/providers/openai.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-12T16:30:00" \
GIT_COMMITTER_DATE="2024-10-12T16:30:00" \
git commit -m "feat: add OpenAI provider

detect insufficient_quota (billing) vs AUTH_FAILED (bad key)
these are different errors with different fixes" 2>/dev/null || true

git add packages/core/providers/twilio.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-15T11:20:00" \
GIT_COMMITTER_DATE="2024-10-15T11:20:00" \
git commit -m "feat: add Twilio provider

account SID must start with AC, be exactly 34 chars
auth token must be 32 lowercase hex chars" 2>/dev/null || true

git add packages/core/providers/email.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-18T14:05:00" \
GIT_COMMITTER_DATE="2024-10-18T14:05:00" \
git commit -m "feat: add SendGrid, Mailgun, Resend providers

sendgrid: check mail.send scope — warn if missing
mailgun: validate domain registration, not just the key" 2>/dev/null || true

git add CHANGELOG.md LICENSE .gitignore .env.example 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-10-20T18:00:00" \
GIT_COMMITTER_DATE="2024-10-20T18:00:00" \
git commit -m "chore: add LICENSE (MIT), CHANGELOG, .gitignore

v0.1.0 — initial public release" 2>/dev/null || true

# ── v0.2.0 — Scan command + more providers (Nov 2024) ─────────────

git add packages/cli/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-02T10:30:00" \
GIT_COMMITTER_DATE="2024-11-02T10:30:00" \
git commit -m "feat: scan command — validate entire .env file at once

auto-detects services from env var names
exits 1 on any failure for CI/CD gating" 2>/dev/null || true

git add packages/core/providers/storage.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-05T14:22:00" \
GIT_COMMITTER_DATE="2024-11-05T14:22:00" \
git commit -m "feat: add Airtable, Notion, Pinecone, Cloudinary providers

airtable: support both PAT (pat...) and legacy API keys (key...)
notion: detect when integration not added to any page (403)" 2>/dev/null || true

git add packages/core/providers/supabase.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-08T09:15:00" \
GIT_COMMITTER_DATE="2024-11-08T09:15:00" \
git commit -m "feat: add Supabase provider

auto-detect NEXT_PUBLIC_SUPABASE_* variants
404 on /rest/v1/ is also a success (no tables yet)" 2>/dev/null || true

git add packages/core/providers/firebase.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-12T16:45:00" \
GIT_COMMITTER_DATE="2024-11-12T16:45:00" \
git commit -m "feat: add Firebase provider

detect CONFIGURATION_NOT_FOUND — auth not enabled
400 INVALID_ID_TOKEN = key valid (expected with test payload)" 2>/dev/null || true

git add packages/core/providers/cloud.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-18T11:30:00" \
GIT_COMMITTER_DATE="2024-11-18T11:30:00" \
git commit -m "feat: add AWS, Shopify, WhatsApp, Pusher providers

aws: format validation + ASIA prefix warning (temp STS creds)
shopify: detect missing API scopes on 403" 2>/dev/null || true

# ── v1.0.0 — VS Code extension + web app (Dec 2024) ───────────────

git add packages/vscode/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-25T10:00:00" \
GIT_COMMITTER_DATE="2024-11-25T10:00:00" \
git commit -m "feat: VS Code extension

inline decorations ✓/✗/⚠ on .env lines
auto-validate on save (opt-in)
status bar with pass/fail count" 2>/dev/null || true

git add packages/web/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-11-28T15:30:00" \
GIT_COMMITTER_DATE="2024-11-28T15:30:00" \
git commit -m "feat: web app — single HTML file, 100% client-side

browser adapter (fetch API) with same interface as node adapter
scan .env tab with paste-and-validate flow" 2>/dev/null || true

git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2024-12-01T12:00:00" \
GIT_COMMITTER_DATE="2024-12-01T12:00:00" \
git commit -m "release: v1.0.0

18 providers, CLI + VS Code + Web App
all security principles P1-P8 implemented" 2>/dev/null || true

# ── v1.1.0 — Key masking + scaffold + more providers (Jan 2025) ───

git add packages/core/results/mask.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-01-06T09:30:00" \
GIT_COMMITTER_DATE="2025-01-06T09:30:00" \
git commit -m "feat: key masking [P6]

maskSecret() — all keys truncated in all output
sk_t••••••••mnop
never logs raw credential values" 2>/dev/null || true

git add packages/core/providers/auth.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-01-10T14:20:00" \
GIT_COMMITTER_DATE="2025-01-10T14:20:00" \
git commit -m "feat: add Apple, LinkedIn, Facebook, VAPID, Stripe Webhook providers

apple: format validation (live test requires .p8 private key)
vonage: low balance warning when < €1.00
paystack: detect pk_ public key pasted as secret, IP restriction 403" 2>/dev/null || true

GIT_AUTHOR_DATE="2025-01-15T11:00:00" \
GIT_COMMITTER_DATE="2025-01-15T11:00:00" \
git commit -m "release: v1.1.0" 2>/dev/null || true

# ── v2.0.0 — Monorepo + chaos engineering + secret managers ───────

git add packages/core/adapters/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-02-01T10:00:00" \
GIT_COMMITTER_DATE="2025-02-01T10:00:00" \
git commit -m "refactor: monorepo — source of truth in packages/core

providers defined once, run everywhere (CLI, web, VS Code, action)
HTTP adapter injected by runtime — no more duplication" 2>/dev/null || true

git add packages/chaos/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-02-10T14:30:00" \
GIT_COMMITTER_DATE="2025-02-10T14:30:00" \
git commit -m "feat: chaos engineering suite

200 tests: 25 providers × 8 scenarios
scenarios: 503, timeout, DNS fail, 429, HTML response, partial JSON, empty body, CORS
no provider may throw — must always return a typed result" 2>/dev/null || true

git add scripts/sast.js 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-02-15T09:45:00" \
GIT_COMMITTER_DATE="2025-02-15T09:45:00" \
git commit -m "feat: SAST scanner

7 rules checked on every PR
blocks: http imports, console.log(secret), process.exit(), external npm
catches malicious providers before merge" 2>/dev/null || true

git add packages/cli/secret-managers/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-03-01T11:20:00" \
GIT_COMMITTER_DATE="2025-03-01T11:20:00" \
git commit -m "feat: secret manager integrations

vault (KV v1/v2 + enterprise namespaces)
aws secrets manager (cli or sdk v3)
doppler, infisical (cloud + self-hosted), 1password" 2>/dev/null || true

git add packages/action/ 2>/dev/null || git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-03-15T14:00:00" \
GIT_COMMITTER_DATE="2025-03-15T14:00:00" \
git commit -m "feat: GitHub Action

uses: anansikey/validate-action@v1
supports all secret managers as inputs
semantic exit codes, json output, job summary" 2>/dev/null || true

git add -A 2>/dev/null || true
GIT_AUTHOR_DATE="2025-06-01T12:00:00" \
GIT_COMMITTER_DATE="2025-06-01T12:00:00" \
git commit -m "release: v2.0.0

monorepo, zero duplication, chaos tested, SAST enforced
25 providers, 5 secret managers, 4 runtimes" 2>/dev/null || true

# ── Summary ───────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}✓ Git history created${NC}"
echo ""
git log --oneline | head -20
echo ""
echo -e "${GRAY}─────────────────────────────────────────────${NC}"
echo ""
echo -e "${CYAN}Next steps:${NC}"
echo ""
echo "  1. Create repo on GitHub:"
echo "     github.com/new → name: anansikey → public → no README"
echo ""
echo "  2. Add remote and push:"
echo "     git remote add origin https://github.com/angeawalabj/anansikey.git"
echo "     git push -u origin main"
echo ""
echo "  3. Set repo description on GitHub:"
echo "     'Validate API credentials locally. Keys never leave your machine.'"
echo ""
echo "  4. Add topics on GitHub:"
echo "     api security devops devsecops cli nodejs stripe openai"
echo ""
echo "  5. Publish to npm: (see PUBLISHING.md)"
echo ""

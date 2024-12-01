# Publishing Guide

Everything you need to publish Anansikey — npm, VS Code marketplace, GitHub setup, and how to share it.

---

## Table of Contents

1. [GitHub Repository Setup](#1-github-repository-setup)
2. [Publish to npm](#2-publish-to-npm)
3. [Publish VS Code Extension](#3-publish-vs-code-extension)
4. [Deploy the Web App](#4-deploy-the-web-app)
5. [Add to Portfolio](#5-add-to-portfolio)
6. [Where to Share](#6-where-to-share)
7. [Copy-Paste Descriptions](#7-copy-paste-descriptions)

---

## 1. GitHub Repository Setup

### Create the repo

1. Go to [github.com/new](https://github.com/new)
2. Repository name: `anansikey`
3. Description: `Validate API credentials locally. Keys never leave your machine.`
4. Public ✓
5. **Do not** check "Add README" — you already have one
6. Click **Create repository**

### Push your code

```bash
cd /path/to/anansikey

# Initialize and run the backdated history script
chmod +x scripts/git-init.sh
./scripts/git-init.sh

# Add remote and push
git remote add origin https://github.com/YOUR_USERNAME/anansikey.git
git push -u origin main
```

### Configure the repo on GitHub

Go to your repo → **Settings** → then:

**General:**
- Website: `https://anansikey.dev` (or your deployment URL)
- Topics: `api`, `security`, `devops`, `devsecops`, `cli`, `nodejs`, `stripe`, `openai`, `credentials`, `dotenv`, `vault`, `doppler`

**Features to enable:**
- ✓ Issues
- ✓ Discussions (good for community questions)
- ✓ Preserve this repository (important for longevity)

**Branch protection (main):**
- Settings → Branches → Add rule → Branch name: `main`
- ✓ Require a pull request before merging
- ✓ Require status checks to pass (select: `sast`, `chaos`)
- ✓ Require conversation resolution before merging

### Create a GitHub Release

```bash
git tag v2.0.0
git push origin v2.0.0
```

Then on GitHub → Releases → Draft a new release → Select `v2.0.0` → Copy from CHANGELOG.md.

---

## 2. Publish to npm

### One-time setup

```bash
# Create an npm account if you don't have one
npm adduser
# or login if you do:
npm login

# Verify you are logged in
npm whoami
```

### Publish @anansikey/core

```bash
cd packages/core

# Check what will be published (verify no secrets are included)
npm pack --dry-run

# Publish
npm publish --access public
```

### Publish the CLI (anansikey)

```bash
cd packages/cli

# Check package.json has the right "bin" field:
# "bin": { "anansikey": "./index.js" }

npm pack --dry-run
npm publish --access public
```

### Verify the publish

```bash
# Install your own package to test
npm install -g anansikey

# Should work:
anansikey --help
anansikey list
anansikey check stripe --secret_key=sk_test_invalid
```

### Update later

```bash
# Bump version in package.json (both core and cli must match)
# Edit: packages/core/package.json → "version": "2.0.1"
# Edit: packages/cli/package.json  → "version": "2.0.1"

npm publish --access public   # from packages/core/
npm publish --access public   # from packages/cli/
```

### Add npm badge to README

The badge in the README is already there:
```markdown
[![npm version](https://img.shields.io/npm/v/anansikey?color=3d8ef0&style=flat-square)](https://www.npmjs.com/package/anansikey)
```

It will update automatically once published.

---

## 3. Publish VS Code Extension

### One-time setup

```bash
# Install the VS Code Extension CLI
npm install -g @vscode/vsce

# Create a publisher account:
# 1. Go to https://marketplace.visualstudio.com/manage
# 2. Sign in with a Microsoft account
# 3. Create a publisher with name: anansikey

# Create a Personal Access Token (PAT):
# 1. Go to https://dev.azure.com → User settings → Personal Access Tokens
# 2. New token → Scopes: Marketplace → Manage
# 3. Copy the token
```

### Package and publish

```bash
cd packages/vscode

# Package (creates anansikey-2.0.0.vsix)
vsce package

# Publish
vsce publish
# Enter your PAT when prompted
```

### Verify

Search "Anansikey" in VS Code Extensions → should appear within 1–5 minutes.

### Update later

```bash
# Bump version in packages/vscode/package.json
vsce publish patch   # increments patch version
vsce publish minor   # increments minor version
```

---

## 4. Deploy the Web App

The web app is a single HTML file — deploy anywhere.

### Option A: Vercel (recommended, free)

```bash
npm install -g vercel
cd packages/web
vercel deploy --prod

# Custom domain:
# vercel domains add anansikey.dev
```

### Option B: Netlify

```bash
npm install -g netlify-cli
cd packages/web
netlify deploy --prod --dir=.
```

### Option C: GitHub Pages (free, no custom domain needed)

1. Push `packages/web/index.html` to the `gh-pages` branch:

```bash
git checkout -b gh-pages
cp packages/web/index.html index.html
git add index.html
git commit -m "deploy web app"
git push origin gh-pages
```

2. GitHub → Settings → Pages → Source: `gh-pages` branch → `/` (root)
3. Your app is live at: `https://YOUR_USERNAME.github.io/anansikey`

### Option D: Cloudflare Pages (free, fast globally)

1. Push to GitHub
2. Cloudflare dashboard → Pages → Create project → Connect to GitHub
3. Select repo → Build settings: none (static HTML) → Deploy

---

## 5. Add to Portfolio

### One-line description

> Open-source API credential validator. Validates 25+ services locally — keys never leave your machine.

### Short description (2–3 sentences)

> Anansikey is a developer security tool that validates API keys, tokens, and credentials before deployment. It supports 25+ services including Stripe, OpenAI, GitHub, and AWS, and integrates with HashiCorp Vault, Doppler, and AWS Secrets Manager. Zero-Knowledge architecture: credentials go directly from your machine to the provider's API — Anansikey's servers are never involved.

### Technical summary for portfolio

**Problem:** Developers waste hours debugging code when the real issue is an invalid or misconfigured API key.

**Solution:** CLI tool + VS Code extension + web app + GitHub Action that validates credentials before deployment.

**Architecture:** ESM monorepo. Provider registry as single source of truth — one file per provider, zero duplication across 4 runtimes (CLI, web, VS Code, GitHub Action). Chaos engineering suite with 200 tests across all providers. SAST scanner blocks malicious provider contributions at PR time.

**Security principles enforced in code:**
- Zero-Knowledge [P1]: credentials never reach Anansikey servers
- Read-Only [P2]: only GET endpoints, nothing mutated
- Key Masking [P6]: `sk_t••••••••mnop`
- Semantic exit codes: 0 valid, 1 auth failed, 2 network, 3 format, 4 rate limited

**Tech stack:** Node.js 20, ESM, zero npm dependencies in core, browser fetch API, VS Code Extension API, GitHub Actions.

### GitHub topics to set

```
api security devops devsecops nodejs cli open-source
stripe openai credentials validation dotenv vault doppler
west-africa ghana benin
```

---

## 6. Where to Share

### Developer Communities

**Reddit:**
- [r/webdev](https://reddit.com/r/webdev) — web developers, relevant for the tool
- [r/node](https://reddit.com/r/node) — Node.js community
- [r/devops](https://reddit.com/r/devops) — DevOps / CI/CD angle
- [r/netsec](https://reddit.com/r/netsec) — security angle (focus on P1 zero-knowledge)
- [r/opensource](https://reddit.com/r/opensource) — open source projects

**Post title for Reddit:**
> I built an open-source tool that validates API keys before deployment — keys never leave your machine

**Hacker News:**
- [news.ycombinator.com/submit](https://news.ycombinator.com/submit)
- Title: `Anansikey – Validate API credentials locally (Open Source)`
- Best time to post: Tuesday–Thursday, 8–10am ET

**Dev.to:**
- [dev.to/new](https://dev.to/new)
- Write a post: "I built Anansikey — here's why API key validation matters"
- Tags: `#opensource #security #devops #nodejs`

**Hashnode:**
- [hashnode.com](https://hashnode.com)
- Same post, different audience

**Product Hunt:**
- [producthunt.com/posts/new](https://producthunt.com/posts/new)
- Category: Developer Tools
- Tagline: `Validate API credentials locally. Keys never leave your machine.`
- Best day: Tuesday or Wednesday, launch at 12:01am PT

**GitHub:**
- Star the repo yourself first
- Submit to [awesome-nodejs](https://github.com/sindresorhus/awesome-nodejs) via PR
- Submit to [awesome-security](https://github.com/sbilly/awesome-security)

### Twitter / X

```
🕷 I built Anansikey — an open-source tool to validate API keys before deployment.

25+ services. Stripe, OpenAI, GitHub, AWS, Supabase...
Works with Vault, Doppler, Infisical directly.
Keys NEVER leave your machine.

npm install -g anansikey

github.com/YOUR_USERNAME/anansikey

#opensource #devops #security #nodejs
```

### LinkedIn

```
I just open-sourced Anansikey — a developer security tool for validating API credentials.

The problem: you spend hours debugging a deployment. The real issue? A trailing space in your API key.

Anansikey catches this in 2 seconds.

✓ 25+ services: Stripe, OpenAI, GitHub, AWS, Supabase, Firebase...
✓ Reads directly from Vault, Doppler, AWS Secrets Manager, Infisical
✓ CLI + VS Code extension + Web app + GitHub Action
✓ Zero-Knowledge: credentials go directly to the provider's API
✓ Open source (MIT)

Install: npm install -g anansikey
GitHub: github.com/YOUR_USERNAME/anansikey

Built in Cotonou 🇧🇯, named after Anansi of Akan mythology.

#opensource #devsecops #security #nodejs #developertools
```

### Discord Servers

Post in `#show-and-tell` or `#projects` channels:

- [Theo's T3 Chat](https://discord.gg/xHdCpcPHRE)
- [Reactiflux](https://discord.gg/reactiflux)
- [Nodeiflux](https://discord.gg/nodeiflux)
- [DevOps Lounge](https://discord.gg/devopslounge)
- [OWASP Community](https://owasp.slack.com)

### Forums

**Stack Overflow:**
Answer relevant questions about API key validation and link to the tool naturally.
Good questions to target:
- "How to validate API key before using it"
- "Check if Stripe API key is valid"
- "Validate .env credentials in CI/CD"

**Dev.to / Hashnode (article ideas):**
1. "Why I built an API credential validator"
2. "Zero-Knowledge architecture: how Anansikey works"
3. "How to add a pre-deploy credential check to your GitHub Actions pipeline"
4. "Chaos engineering for an open-source CLI tool"

---

## 7. Copy-Paste Descriptions

### npm page (packages/cli/package.json description)

```json
"description": "Validate API credentials locally — Stripe, OpenAI, GitHub, AWS and 22 more. Keys never leave your machine."
```

### VS Code marketplace (packages/vscode/package.json description)

```json
"description": "Validate API credentials directly in your editor. Inline ✓/✗/⚠ decorations on .env files. Zero-Knowledge: keys never leave your machine."
```

### GitHub About (repo description field)

```
Validate API credentials locally. 25+ services. CLI + VS Code + Web + GitHub Action. Keys never leave your machine.
```

### GitHub README tagline (already in README, copy for other uses)

```
Outsmart API Key Errors. Validate locally, deploy confidently.
```

### One-tweet description

```
Validate API keys before deployment. Stripe, OpenAI, GitHub, AWS + 22 more.
Works with Vault, Doppler, Infisical. Open source. Keys never leave your machine.
npm i -g anansikey
```

### Portfolio project card

**Title:** Anansikey
**Subtitle:** Open-source API credential validator
**Tags:** Node.js · Security · DevSecOps · Open Source
**Link:** github.com/YOUR_USERNAME/anansikey
**Image:** Use `packages/vscode/media/logo.svg` or the social preview SVG

**Description (English):**
Developer security tool that validates API keys, tokens and credentials before deployment. Zero-Knowledge architecture — credentials never reach our servers. Supports 25+ services, integrates with Vault, Doppler, AWS Secrets Manager and Infisical.

**Description (Français):**
Outil de sécurité pour développeurs qui valide les clés API, tokens et credentials avant le déploiement. Architecture Zéro-Connaissance — les credentials n'atteignent jamais nos serveurs. Supporte 25+ services, s'intègre avec Vault, Doppler, AWS Secrets Manager et Infisical.

---

## Checklist: Launch Day

```
[ ] GitHub repo created and pushed
[ ] npm package published: npm install -g anansikey works
[ ] Web app deployed and accessible
[ ] VS Code extension on marketplace
[ ] README has correct links (npm badge, vscode badge, web app URL)
[ ] GitHub topics set
[ ] Pinned repo on your GitHub profile

[ ] Posted on Reddit (r/webdev, r/devops)
[ ] Posted on Hacker News
[ ] Posted on Dev.to
[ ] Tweeted / posted on X
[ ] Posted on LinkedIn
[ ] Shared in relevant Discord servers

[ ] Added to portfolio
[ ] Updated GitHub bio with link
```

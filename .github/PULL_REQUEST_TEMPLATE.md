## What does this PR do?

<!-- Short description -->

## Type

- [ ] New provider
- [ ] Bug fix
- [ ] Documentation
- [ ] Refactor
- [ ] Other: ___

---

## For new providers — checklist

- [ ] Lint passes — `pnpm run lint`
- [ ] SAST passes — `pnpm run sast`
- [ ] Unit tests + chaos suite pass — `pnpm run test`
- [ ] Provider registered in `packages/core/index.js` (browser-safe) **or**
      `packages/core/index.node.js` if it needs `node:crypto`
- [ ] Test creds added to `packages/chaos/runner.js` → `VALID_CREDS`
- [ ] Web app still builds clean — `pnpm run build:web && pnpm run verify:web-bundle-purity`
      (no manual step needed: the web app bundles the core registry, providers are never duplicated there)
- [ ] `WIKI-Supported-Services.md` updated

### Security checklist

- [ ] No `import https` / `import fetch` / `import axios` in provider file
- [ ] No `console.log(creds...)` or similar
- [ ] No `process.exit()` in provider
- [ ] `parse()` checks `body._malformed`
- [ ] All HTTP status codes mapped to human messages with fix text [P3]
- [ ] `maskSecret()` used in success output [P6]
- [ ] `netErr(e)` used for network failures

### Testing evidence

**Valid key → ✓:**
```
paste output here (mask your key first)
```

**Invalid key → ✗:**
```
paste output here
```

**Wrong format → FORMAT_ERROR:**
```
paste output here
```

**Empty key → MISSING_KEY:**
```
paste output here
```

---

## For bug fixes

- [ ] Root cause identified and explained in description
- [ ] Fix does not break other providers (chaos suite passes)
- [ ] Regression test added if applicable

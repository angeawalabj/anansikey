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

- [ ] `scripts/sast.js` passes — `node scripts/sast.js`
- [ ] Chaos suite passes — `node packages/chaos/runner.js`
- [ ] Provider added to `packages/core/index.js`
- [ ] Test creds added to `packages/chaos/runner.js` → `VALID_CREDS`
- [ ] Provider added to `packages/web/index.html` PROVIDERS array
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

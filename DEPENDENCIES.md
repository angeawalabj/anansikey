# Dependency policy

This monorepo uses **pnpm workspaces** (pnpm ≥11, Node ≥24 LTS). One lockfile
at the root (`pnpm-lock.yaml`), committed, never ignored.

## Zero-dependency core

`packages/core` — the package that touches credentials — has **zero runtime
dependencies**, enforced two ways:

1. `packages/core/package.json` declares `"dependencies": {}` and is checked
   in CI (`pnpm run check:core-zero-deps`) — the manifest must stay empty.
2. `scripts/sast.js` (`NO_EXTERNAL_NPM` rule) statically scans every provider
   file and rejects any import that isn't relative or `@anansikey/core/*`.

Both checks must agree. If one is green and the other red, that's a bug in
the check, not a waiver to ship.

## Everything else

Other packages (`cli`, `action`, `vscode`, `web`) declare exact, minimal
dependencies via the `workspace:*` protocol for internal packages, and a
shared `catalog:` entry in `pnpm-workspace.yaml` for the one external
dependency they share (`@actions/core`) — so a version bump happens in one
place, not N times.

Per-package external dependencies, in full:

| Package | Dependency | Kind | Why |
| --- | --- | --- | --- |
| `core` | — | — | zero by design (see above) |
| `cli` | `@aws-sdk/client-secrets-manager` | optional | fallback for `--from-aws` when the `aws` CLI binary is absent |
| `action` | `@actions/core` (`catalog:`) | runtime | GitHub Actions input/output SDK; the entrypoint falls back to a local shim if it is missing |
| `vscode` | `@types/vscode`, `@vscode/vsce` | dev | typings and packaging only — never shipped in the `.vsix` payload |
| `web` | `esbuild` | dev | build-time only; the shipped artifact is a single static HTML file |

## Lockfile status

⚠️ `pnpm-lock.yaml` is committed but **not currently in sync with the
manifests**. It was resolved before the CLI package was renamed to its
published name (`anansikey`, not `@anansikey/cli`) and before
`packages/vscode` declared `@vscode/vsce`. Until someone runs `pnpm install`
with network access and commits the regenerated lockfile,
`pnpm install --frozen-lockfile` — which CI uses — will fail. Do not
hand-edit it to paper over this.

## External system binaries (not npm dependencies)

`packages/cli/secret-managers/aws.js` and `onepassword.js` shell out to the
`aws` and `op` CLIs via `execSync`. These are **not vendored, not npm
packages, and invisible to `pnpm audit` / Dependabot**. They are documented
here explicitly because that invisibility is exactly what makes them risky:

- `aws` CLI ≥2.x — required only if using `--from-aws`. Falls back to
  `@aws-sdk/client-secrets-manager` (optional dependency) if the CLI binary
  isn't found.
- `op` (1Password CLI) ≥2.x — required only if using `--from-1password`.
  No fallback; fails with an explicit setup message if absent.

## Audit & update automation

- **Dependabot** (`.github/dependabot.yml`) opens update PRs weekly, scoped
  to `cli`, `action`, `vscode` — never `core`, which has nothing to update.
- **`pnpm audit --audit-level=high`** and **OSV-Scanner** run in CI on every
  PR, blocking on high/critical findings.
- Supply-chain guardrails are also enforced at install time via
  `pnpm-workspace.yaml`: `minimumReleaseAge: 1440` (a package must be public
  for 24h before pnpm will install it — the classic window in which a
  compromised release gets caught and pulled) and `trustPolicy: no-downgrade`
  (installation fails if a package's provenance/trust signal regresses
  compared to a previous release).

## Pinning

Versions affecting the trust boundary (`@actions/core`,
`@aws-sdk/client-secrets-manager`) are pinned to an exact minor and bumped
manually via reviewed PR — not auto-merged, even by Dependabot.

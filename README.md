# Anansikey — validateur de clés API et de credentials pour CLI, VS Code et CI/CD

[![Licence MIT](https://img.shields.io/badge/licence-MIT-3d8ef0?style=flat-square)](./LICENSE)

Anansikey est un outil de sécurité pour développeurs qui vérifie qu'une clé API, un token ou un credential est **valide et actif**, avant qu'il ne provoque une panne en production. Plutôt que de scanner du code à la recherche de secrets qui auraient fuité, il interroge en lecture seule l'API réelle de chaque fournisseur (Stripe, GitHub, OpenAI, AWS, Supabase...) pour confirmer que la clé fonctionne, avec le bon format et les bonnes permissions. Le projet est structuré en monorepo Node.js : un registre de providers unique (`packages/core`) est réutilisé sans duplication par une CLI, une extension VS Code, une action GitHub et une application web. Il s'adresse aux équipes qui veulent fiabiliser leurs pipelines de déploiement et détecter une clé mal configurée avant le `git push`.

Nommé d'après **Anansi**, le dieu-araignée trickster de la mythologie akan (Bénin / Ghana) — celui qui démêle toujours la vérité en tissant les bonnes questions.

Dépôt : [github.com/angeawalabj/anansikey](https://github.com/angeawalabj/anansikey)

---

## Stack technique

| Technologie | Usage |
| --- | --- |
| Node.js ≥ 24, modules ES (`type: module`) | Runtime du core, de la CLI, de l'action GitHub et de la suite de tests |
| pnpm workspaces (`pnpm-workspace.yaml`) | Gestion du monorepo (`packages/*`), protocole `workspace:*` et `catalog:` pour les versions partagées |
| JavaScript pur, zéro dépendance | `packages/core` : registre de providers, logique `format()` / `request()` / `parse()` |
| Module `https` de Node.js | Adapter réseau pour CLI, VS Code et Action GitHub (`packages/core/adapters/node.js`) |
| Fetch API + `AbortController` (navigateur) | Adapter réseau de l'application web (`packages/core/adapters/browser.js`) |
| `node:crypto` | Signature réelle des 4 providers node-only (`providers/*.node.js` : AWS SigV4, Pusher HMAC, Apple ES256, VAPID ECDH) |
| VS Code Extension API | Extension éditeur avec décorations inline (`packages/vscode`) |
| `@actions/core` | SDK de la GitHub Action (`packages/action`) |
| esbuild | Build de l'application web : bundle le vrai registre core en un fichier HTML unique (`packages/web/build.js`) |
| `node --test` | Tests unitaires des primitives cryptographiques (`packages/core/providers/__tests__/`) |
| ESLint + `eslint-plugin-security` | Lint du monorepo (`eslint.config.js`), règles durcies sur `packages/core` |
| GitHub Actions (`ci.yml`, `release.yml`) | Intégration continue (lint, SAST, audit, OSV-Scanner, tests unitaires, chaos, build web, tests de fumée) et publication (npm, VS Code Marketplace, GitHub Release) |
| Dependabot + `pnpm audit` + OSV-Scanner | Veille de dépendances et supply-chain (`.github/dependabot.yml`, `DEPENDENCIES.md`) |
| Scanner SAST maison (`scripts/sast.js`) | Analyse statique des fichiers providers (7 règles) |
| Harnais de chaos engineering (`packages/chaos`) | Injection de pannes réseau contrôlées pour valider la robustesse de chaque provider |

---

## Fonctionnalités

- **Validation en direct de 25 services** répartis par catégorie : paiements (Stripe, PayStack, Stripe Webhook), email (SendGrid, Mailgun, Resend), SMS/appels (Twilio, Vonage), IA/ML (OpenAI, Pinecone), bases de données (Supabase, Airtable), backend (Firebase), auth (Google OAuth2, Apple Sign-In), social (LinkedIn, Facebook/Meta), cloud (AWS), stockage (Cloudinary), e-commerce (Shopify), messagerie (WhatsApp Business), temps réel (Pusher), outils dev (GitHub), productivité (Notion), notifications (VAPID/Web Push).
- **Trois fonctions pures par provider** : `format()` valide localement le format de la clé sans appel réseau, `request()` construit un descripteur de requête, `parse()` interprète la réponse HTTP. Aucun fichier provider n'importe directement une librairie réseau — l'adapter (Node.js ou navigateur) est injecté par le runtime.
- **Détection automatique des services** à partir d'un fichier `.env` ou d'un ensemble de variables d'environnement (`detectServices()` + `ENV_VAR_MAP` dans `packages/core/index.js`).
- **Masquage systématique des secrets** à l'affichage via `maskSecret()` (ex. `sk_t••••••••mnop`), y compris pour les objets de credentials complets via `sanitizeCreds()` (`packages/core/results/mask.js`).
- **Codes de sortie sémantiques** exploitables en CI/CD : `0` valide, `1` échec d'authentification, `2` erreur réseau, `3` erreur de format, `4` rate limit, `5` avertissement, `9` erreur interne.
- **Lecture directe depuis 5 gestionnaires de secrets** — HashiCorp Vault, AWS Secrets Manager, Doppler, Infisical, 1Password (`packages/cli/secret-managers`) — sans passer par un fichier `.env` intermédiaire.
- **Quatre interfaces partageant le même registre core**, sans duplication de logique : CLI (`packages/cli`), Action GitHub (`packages/action`), extension VS Code (`packages/vscode`), application web (`packages/web`). L'application web n'embarque pas une copie des providers : `packages/web/build.js` bundle le vrai `packages/core` avec esbuild en un fichier HTML statique unique.
- **Séparation navigateur / Node.js explicite** : `packages/core/index.js` est le registre *browser-safe* (21 providers, son graphe d'import n'atteint jamais `node:crypto`) ; `packages/core/index.node.js` l'étend avec les 4 providers qui exigent une signature cryptographique réelle (AWS, Pusher, Apple, VAPID). Node.js résout automatiquement le bon point d'entrée via la condition `"node"` du champ `exports`. Deux garde-fous mécaniques vérifient l'invariant : `scripts/check-web-bundle-purity.js` (aucune référence `node:*` dans le bundle navigateur) et `scripts/check-core-zero-deps.js` (manifeste du core sans dépendance).
- **Tests unitaires des primitives cryptographiques** (`packages/core/providers/__tests__/`, `pnpm run test:unit`) : la dérivation de clé AWS SigV4, la signature HMAC Pusher, le JWT ES256 Apple et l'ECDH VAPID sont comparés aux exemples officiels publiés par chaque fournisseur.
- **Suite de chaos engineering** (`packages/chaos`) : 8 scénarios de panne (503, timeout, échec DNS, rate limit 429, réponse HTML malformée, JSON tronqué, corps vide, blocage CORS) rejoués contre chaque provider — 200 tests au total — pour garantir qu'aucun provider ne lève d'exception sur une réponse inattendue.
- **Scanner SAST maison** (`scripts/sast.js`) qui bloque, avant fusion, tout provider important une librairie HTTP directement, loggant un secret en clair, appelant `process.exit()`, ou ajoutant une dépendance npm externe.
- **Commande `scaffold`** pour générer le squelette d'un nouveau provider (`format`/`request`/`parse`) en quelques minutes.

---

## Sécurité

Le modèle de menace (`SECURITY.md`) part du principe qu'il n'y a ni serveur ni base de données à compromettre — le risque principal est un provider malveillant qui exfiltrerait des credentials. Le code applique deux garde-fous vérifiables :

- **Architecture « zero-knowledge »** : chaque requête part directement de la machine de l'utilisateur vers l'API du fournisseur (`api.stripe.com`, `api.github.com`...) — aucun serveur Anansikey n'est impliqué. Vérifiable via `strace` en CLI ou l'onglet Réseau des DevTools côté web.
- **SAST bloquant** : les fichiers de `packages/core/providers/` ne peuvent pas importer `https`, `fetch`, `axios` ou toute dépendance npm externe, ne peuvent pas logger un secret via `console.log`, et doivent gérer les réponses malformées (`body._malformed`). Ces règles tournent sur chaque pull request (`.github/workflows/ci.yml`).

---

## Structure du projet

```text
anansikey/
├── package.json               # racine du monorepo (scripts transverses, devDependencies de lint)
├── pnpm-workspace.yaml        # source de vérité des workspaces + catalog + politique supply-chain
├── pnpm-lock.yaml             # lockfile committé (voir DEPENDENCIES.md)
├── eslint.config.js           # ESLint flat config + eslint-plugin-security
├── LICENSE                    # MIT
├── SECURITY.md                # politique de sécurité et modèle de menace
├── DEPENDENCIES.md            # politique de dépendances (core à zéro dépendance)
├── CONTRIBUTING.md            # guide d'ajout d'un provider
├── PUBLISHING.md              # guide de publication (npm, VS Code, web)
├── scripts/
│   ├── sast.js                  # analyse statique des fichiers providers
│   ├── check-core-zero-deps.js  # le manifeste du core doit rester sans dépendance
│   └── check-web-bundle-purity.js # aucun node:crypto dans le bundle navigateur
├── .github/
│   ├── dependabot.yml           # mises à jour hebdomadaires (cli, action, vscode, workflows)
│   └── workflows/
│       ├── ci.yml               # lint, SAST, audit, OSV, tests unitaires, chaos, build web, fumée
│       └── release.yml          # publication npm, VS Code Marketplace, GitHub Release
└── packages/
    ├── core/                   # registre de providers — source unique de vérité
    │   ├── index.js              # registre browser-safe (21 providers)
    │   ├── index.node.js         # registre complet (25 providers) — condition d'export "node"
    │   ├── providers/            # stripe.js, github.js, ... + *.node.js (aws, pusher, apple, vapid)
    │   │   └── __tests__/          # tests unitaires des primitives crypto
    │   ├── adapters/              # node.js (https) et browser.js (fetch)
    │   └── results/                # ok/fail/warn, codes de sortie, maskSecret()
    ├── cli/                     # CLI (bin: anansikey)
    │   └── secret-managers/       # vault.js, aws.js, doppler.js, infisical.js, onepassword.js
    ├── action/                  # GitHub Action (action.yml + entrypoint.js)
    ├── vscode/                  # extension VS Code (décorations inline sur les .env)
    ├── web/                     # application web — bundle le vrai core, zéro duplication
    │   ├── build.js               # build esbuild → dist/index.html (fichier unique)
    │   └── src/                   # entry.js (logique UI) + index.html (coquille + styles)
    └── chaos/                   # suite de chaos engineering
        ├── harness/                # scénarios de panne injectables
        └── scenarios/              # tests approfondis par provider (ex. stripe.chaos.js)
```

---

## Installation

Prérequis : Node.js ≥ 24 et pnpm ≥ 11 (voir `engines` et `packageManager` dans `package.json`).

```bash
git clone https://github.com/angeawalabj/anansikey.git
cd anansikey
pnpm install
```

> Le monorepo est géré par **pnpm workspaces** — `pnpm-workspace.yaml` est la seule source de vérité pour la liste des packages, le `catalog:` des versions partagées et la politique supply-chain (`minimumReleaseAge`, `trustPolicy`). Il n'y a volontairement pas de champ `workspaces` npm dans le `package.json` racine.

## Usage

### Scripts du monorepo (définis dans le `package.json` racine)

```bash
pnpm test                        # tests unitaires + suite de chaos complète
pnpm run test:unit               # tests des primitives crypto (node --test)
pnpm run chaos                   # 200 scénarios de panne (packages/chaos/runner.js)
pnpm run lint                    # ESLint + eslint-plugin-security
pnpm run sast                    # scanner SAST maison (scripts/sast.js)
pnpm run check                   # SAST + suite de chaos
pnpm run check:core-zero-deps    # le core ne doit déclarer aucune dépendance
pnpm run build:web               # bundle esbuild → packages/web/dist/index.html
pnpm run verify:web-bundle-purity # aucun node:crypto dans le bundle navigateur
pnpm run audit                   # pnpm audit --audit-level=high
pnpm run verify                  # enchaîne toutes les vérifications ci-dessus
pnpm run scaffold                # génère le squelette d'un nouveau provider
```

### CLI

```bash
# Valider une seule clé
node packages/cli/index.js check stripe --secret_key=sk_test_xxx

# ou via variable d'environnement
STRIPE_SECRET_KEY=sk_test_xxx node packages/cli/index.js check stripe

# Scanner un fichier .env entier
node packages/cli/index.js scan .env.production

# Lire les secrets depuis un gestionnaire puis les valider
VAULT_TOKEN=hvs.xxx node packages/cli/index.js scan --from-vault=vault://secret/data/myapp
DOPPLER_TOKEN=dp.st.xxx node packages/cli/index.js scan --from-doppler --project=myapp --config=production

# Lister les services supportés
node packages/cli/index.js list

# Générer un nouveau provider
node packages/cli/index.js scaffold --name=MonService

# Aide
node packages/cli/index.js help
```

`packages/cli/package.json` déclare un champ `bin` (`anansikey`) : une fois le package installé globalement, les mêmes commandes sont accessibles via `anansikey check`, `anansikey scan`, etc.

> Note : la commande `fetch`, listée dans l'aide de la CLI, n'est pas encore implémentée dans cette version — `packages/cli/index.js` retourne actuellement `fetch command coming in next build step`.

### Action GitHub

```yaml
- name: Valider les credentials
  uses: ./packages/action
  with:
    env_file: .env.production
```

### Extension VS Code

Ouvrir `packages/vscode` dans VS Code et lancer *Exécuter → Démarrer le débogage de l'extension* : elle ajoute des décorations `✓`/`✗`/`⚠` inline sur les fichiers `.env` du workspace.

### Application web

```bash
pnpm run build:web   # produit packages/web/dist/index.html
```

Le build est un fichier HTML autonome : le bundle JavaScript est inliné, il n'y a ni serveur, ni requête externe pour charger l'application elle-même. Il se déploie en copiant ce seul fichier (GitHub Pages, Netlify, Vercel — voir `PUBLISHING.md`).

Les 21 providers *browser-safe* y sont pleinement utilisables. Les 4 providers node-only (AWS, Pusher, Apple, VAPID) sont listés dans la barre latérale avec le badge « CLI only » et une explication : leur validation exige une signature cryptographique réelle via `node:crypto`, absente du navigateur. C'est une limite structurelle assumée, pas une fonctionnalité manquante.

---

## Licence

MIT — voir [LICENSE](./LICENSE) (Copyright © 2024 Anansikey Contributors).

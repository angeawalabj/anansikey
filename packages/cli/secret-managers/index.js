/**
 * @anansikey/cli — Secret manager dispatcher
 *
 * Detects --from-* flags and routes to the correct fetcher.
 * Returns { vars: {KEY: VALUE}, sourceLabel: string } or null.
 */

import { fetchFromVault }     from './vault.js';
import { fetchFromAWS }       from './aws.js';
import { fetchFromDoppler }   from './doppler.js';
import { fetchFromInfisical } from './infisical.js';
import { fetchFrom1Password } from './onepassword.js';

export async function resolveSecretSource(args) {
  const fv  = args.find(a => a.startsWith('--from-vault'));
  const fa  = args.find(a => a.startsWith('--from-aws'));
  const fd  = args.find(a => a.startsWith('--from-doppler'));
  const fi  = args.find(a => a.startsWith('--from-infisical'));
  const f1p = args.find(a => a.startsWith('--from-1password'));
  const fj  = args.find(a => a.startsWith('--from-json'));

  if (!fv && !fa && !fd && !fi && !f1p && !fj) return null;

  console.log(); // spacing

  if (fv) {
    const uri = fv.includes('=') ? fv.replace('--from-vault=', '')
      : args[args.indexOf(fv) + 1] || '';
    return { vars: await fetchFromVault(uri, args), sourceLabel: 'Vault' };
  }
  if (fa) {
    const arn = fa.includes('=') ? fa.replace('--from-aws=', '')
      : args[args.indexOf(fa) + 1] || '';
    return { vars: await fetchFromAWS(arn, args), sourceLabel: 'AWS Secrets Manager' };
  }
  if (fd)  return { vars: await fetchFromDoppler(args),   sourceLabel: 'Doppler' };
  if (fi)  return { vars: await fetchFromInfisical(args), sourceLabel: 'Infisical' };
  if (f1p) return { vars: await fetchFrom1Password(args), sourceLabel: '1Password' };

  if (fj) {
    const { readFileSync, existsSync } = await import('fs');
    const { resolve } = await import('path');
    const jsonPath = fj.includes('=') ? fj.replace('--from-json=', '')
      : args[args.indexOf(fj) + 1] || '';
    const abs = resolve(jsonPath);
    if (!existsSync(abs)) {
      console.error(`\x1b[31m  ✗ File not found: ${abs}\x1b[0m`);
      process.exit(3);
    }
    const parsed = JSON.parse(readFileSync(abs, 'utf8'));
    const secrets = {};
    for (const [k, v] of Object.entries(parsed))
      secrets[k] = typeof v === 'string' ? v : (v.value ?? v.secret ?? JSON.stringify(v));
    console.log(`\x1b[32m  ✓ JSON: ${Object.keys(secrets).length} key(s)\x1b[0m`);
    return { vars: secrets, sourceLabel: `JSON (${jsonPath})` };
  }

  return null;
}

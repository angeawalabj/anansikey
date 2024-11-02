import { request } from '../../core/adapters/node.js';
import { maskSecret } from '../../core/results/mask.js';
const G='\x1b[32m',R='\x1b[31m',C='\x1b[36m',D='\x1b[90m',X='\x1b[0m';

export async function fetchFromVault(uri, args=[]) {
  const VAULT_ADDR  = process.env.VAULT_ADDR || '';
  const VAULT_TOKEN = process.env.VAULT_TOKEN || args.find(a=>a.startsWith('--token='))?.replace('--token=','') || '';
  const VAULT_NS    = process.env.VAULT_NAMESPACE || '';
  if (!VAULT_TOKEN) { console.error(R+'  ✗ VAULT_TOKEN not set\n  export VAULT_TOKEN=hvs.xxx'+X); process.exit(1); }
  let hostname, port=443, secretPath;
  if (uri.startsWith('vault://')) {
    const body = uri.slice(8);
    const m = body.match(/^([^/]+:\d+)(\/.*)/);
    if (m) { [hostname, port] = m[1].split(':'); port=Number(port); secretPath=m[2]; }
    else {
      if (!VAULT_ADDR) { console.error(R+'  ✗ VAULT_ADDR not set'+X); process.exit(1); }
      const base = new URL(VAULT_ADDR.startsWith('http')?VAULT_ADDR:'https://'+VAULT_ADDR);
      hostname=base.hostname; port=Number(base.port)||443; secretPath='/'+body;
    }
  } else { secretPath=uri.startsWith('/')?uri:'/'+uri; const base=new URL(VAULT_ADDR.startsWith('http')?VAULT_ADDR:'https://'+VAULT_ADDR); hostname=base.hostname; port=Number(base.port)||443; }
  const isKVv2 = secretPath.includes('/data/');
  console.log(C+'  → Vault: '+hostname+secretPath+' (KV '+(isKVv2?'v2':'v1')+')'+X);
  try {
    const r = await request({ hostname, port, path:'/v1'+secretPath, headers:{'X-Vault-Token':VAULT_TOKEN,...(VAULT_NS?{'X-Vault-Namespace':VAULT_NS}:{})} });
    if (r.status===200) {
      const secrets = isKVv2?r.body?.data?.data:r.body?.data;
      if (!secrets||typeof secrets!=='object') { console.error(R+'  ✗ No secret data at '+secretPath+X); process.exit(1); }
      const meta = isKVv2?r.body?.data?.metadata:null;
      console.log(G+'  ✓ Vault: '+Object.keys(secrets).length+' key(s)'+(meta?' — version '+meta.version:'')+X);
      return secrets;
    }
    if (r.status===403) { console.error(R+'  ✗ Vault: Permission denied\n  Check: vault token capabilities '+secretPath+X); process.exit(1); }
    if (r.status===404) { console.error(R+'  ✗ Vault: Not found — '+secretPath+'\n  KV v2 needs /data/ e.g. secret/data/myapp'+X); process.exit(1); }
    console.error(R+'  ✗ Vault: HTTP '+r.status+' '+JSON.stringify(r.body?.errors)+X); process.exit(1);
  } catch(e) { console.error(R+'  ✗ Cannot reach Vault ('+hostname+'): '+e.message+X); process.exit(2); }
}

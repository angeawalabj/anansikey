import { request } from '../../core/adapters/node.js';
import { maskSecret } from '../../core/results/mask.js';
const G='\x1b[32m',R='\x1b[31m',C='\x1b[36m',D='\x1b[90m',X='\x1b[0m';
export async function fetchFromInfisical(args=[]) {
  const token = process.env.INFISICAL_TOKEN||args.find(a=>a.startsWith('--token='))?.replace('--token=','');
  const host  = (process.env.INFISICAL_HOST||args.find(a=>a.startsWith('--host='))?.replace('--host=','')||'https://app.infisical.com').replace(/\/$/,'');
  const projectId = process.env.INFISICAL_PROJECT_ID||args.find(a=>a.startsWith('--project='))?.replace('--project=','')||args.find(a=>a.startsWith('--workspace='))?.replace('--workspace=','');
  const environment = process.env.INFISICAL_ENVIRONMENT||args.find(a=>a.startsWith('--env='))?.replace('--env=','')||args.find(a=>a.startsWith('--environment='))?.replace('--environment=','')||'production';
  const secretPath = process.env.INFISICAL_SECRET_PATH||args.find(a=>a.startsWith('--path='))?.replace('--path=','')||'/';
  if (!token) { console.error(R+'  ✗ INFISICAL_TOKEN not set\n  app.infisical.com → Access Control → Machine Identities'+X); process.exit(1); }
  if (!projectId) { console.error(R+'  ✗ Project ID required: --project=<uuid> or INFISICAL_PROJECT_ID'+X); process.exit(1); }
  const isServiceToken=token.startsWith('st.');
  const isSelfHosted=!host.includes('app.infisical.com');
  let hostname,port=443;
  try { const p=new URL(host.startsWith('http')?host:'https://'+host); hostname=p.hostname; port=Number(p.port)||443; }
  catch { console.error(R+'  ✗ Invalid INFISICAL_HOST: '+host+X); process.exit(1); }
  const displayHost=isSelfHosted?hostname:'Infisical Cloud';
  console.log(C+'  → Infisical: '+displayHost+' · project='+projectId.slice(0,8)+'… · env='+environment+(secretPath!=='/'?' · path='+secretPath:'')+X);
  console.log(D+'  Token: '+(isServiceToken?'Service Token':'Machine Identity')+' ('+maskSecret(token)+')'+X);
  const qs=new URLSearchParams({workspaceId:projectId,environment,secretPath,expandSecretReferences:'true'});
  try {
    const r=await request({hostname,port,path:'/api/v3/secrets/raw?'+qs,headers:{'Authorization':'Bearer '+token}});
    if (r.status===200) {
      if (!Array.isArray(r.body?.secrets)) { console.error(R+'  ✗ Unexpected response shape'+X); process.exit(1); }
      if (r.body.secrets.length===0) { console.log('\x1b[33m  ⚠ No secrets in "'+environment+'"'+X); return {}; }
      const secrets={};
      for (const s of r.body.secrets) if (s.secretKey&&s.secretValue!=null) secrets[s.secretKey]=s.secretValue;
      console.log(G+'  ✓ Infisical: '+Object.keys(secrets).length+' key(s) — "'+environment+'"'+X);
      return secrets;
    }
    if (r.status===401) { console.error(R+'  ✗ Infisical: Auth failed — regenerate token'+X); process.exit(1); }
    if (r.status===403) { console.error(R+'  ✗ Infisical: Access denied to "'+environment+'"\n  Grant READ: '+displayHost+' → Access Control'+X); process.exit(1); }
    if (r.status===404) { console.error(R+'  ✗ Infisical: Project "'+projectId+'" not found'+X); process.exit(1); }
    console.error(R+'  ✗ Infisical: HTTP '+r.status+X); process.exit(1);
  } catch(e) { console.error(R+'  ✗ Cannot reach Infisical ('+hostname+'): '+e.message+X); process.exit(2); }
}

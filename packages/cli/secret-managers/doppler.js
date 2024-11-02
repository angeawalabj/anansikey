import { request } from '../../core/adapters/node.js';
const G='\x1b[32m',R='\x1b[31m',C='\x1b[36m',X='\x1b[0m';
export async function fetchFromDoppler(args=[]) {
  const token = process.env.DOPPLER_TOKEN||args.find(a=>a.startsWith('--token='))?.replace('--token=','');
  const project = args.find(a=>a.startsWith('--project='))?.replace('--project=','')||process.env.DOPPLER_PROJECT||'';
  const config  = args.find(a=>a.startsWith('--config='))?.replace('--config=','')||process.env.DOPPLER_CONFIG||'';
  if (!token) { console.error(R+'  ✗ DOPPLER_TOKEN not set\n  DOPPLER_TOKEN=dp.st.xxx anansikey scan --from-doppler'+X); process.exit(1); }
  const qs = new URLSearchParams({format:'json',include_dynamic_secrets:'false',...(project?{project}:{}),...(config?{config}:{})});
  console.log(C+'  → Doppler: project='+(project||'default')+' config='+(config||'default')+X);
  try {
    const r = await request({ hostname:'api.doppler.com', path:'/v3/configs/config/secrets/download?'+qs, headers:{'Authorization':'Basic '+Buffer.from(token+':').toString('base64')} });
    if (r.status===200) {
      const secrets={};
      for (const [k,v] of Object.entries(r.body)) { if (k.startsWith('DOPPLER_')) continue; secrets[k]=typeof v==='object'?(v.value??v.raw??''):String(v); }
      console.log(G+'  ✓ Doppler: '+Object.keys(secrets).length+' key(s)'+X);
      return secrets;
    }
    if (r.status===401) { console.error(R+'  ✗ Doppler: Invalid token — regenerate at dashboard.doppler.com'+X); process.exit(1); }
    if (r.status===404) { console.error(R+'  ✗ Doppler: Project/config not found'+X); process.exit(1); }
    console.error(R+'  ✗ Doppler: HTTP '+r.status+X); process.exit(1);
  } catch(e) { console.error(R+'  ✗ Cannot reach Doppler: '+e.message+X); process.exit(2); }
}

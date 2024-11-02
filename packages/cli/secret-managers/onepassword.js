const G='\x1b[32m',R='\x1b[31m',C='\x1b[36m',X='\x1b[0m';
export async function fetchFrom1Password(args=[]) {
  const vault = args.find(a=>a.startsWith('--vault='))?.replace('--vault=','')||'';
  const item  = args.find(a=>a.startsWith('--item='))?.replace('--item=','');
  if (!item) { console.error(R+'  ✗ --item=<name> required\n  anansikey scan --from-1password --vault=Dev --item=Stripe'+X); process.exit(1); }
  console.log(C+'  → 1Password: vault='+(vault||'default')+' item="'+item+'"'+X);
  try {
    const { execSync } = await import('child_process');
    const raw = execSync('op item get "'+item+'" '+(vault?'--vault "'+vault+'" ':'')+' --format json',{encoding:'utf8',timeout:15000,stdio:['pipe','pipe','pipe']});
    const parsed=JSON.parse(raw);
    const secrets={};
    for (const field of parsed.fields||[]) {
      if (!field.value||field.type==='OTP') continue;
      const key=(field.label||field.id||'FIELD').toUpperCase().replace(/[^A-Z0-9]/g,'_');
      secrets[key]=field.value;
    }
    console.log(G+'  ✓ 1Password: '+Object.keys(secrets).length+' field(s) from "'+parsed.title+'"'+X);
    return secrets;
  } catch(e) {
    if (e.message.includes('not found')||e.message.includes('command not found')) { console.error(R+'  ✗ 1Password CLI not found or not signed in\n  brew install 1password-cli && op signin'+X); }
    else { console.error(R+'  ✗ 1Password: '+e.message.split('\n')[0]+'\n  Try: op signin'+X); }
    process.exit(1);
  }
}

const G='\x1b[32m',R='\x1b[31m',C='\x1b[36m',X='\x1b[0m';
export async function fetchFromAWS(arn, args=[]) {
  const region = process.env.AWS_REGION||process.env.AWS_DEFAULT_REGION||args.find(a=>a.startsWith('--region='))?.replace('--region=','')||arn.match(/arn:aws:secretsmanager:([^:]+):/)?.[1]||'us-east-1';
  console.log(C+'  → AWS Secrets Manager: '+(arn.split(':').pop())+' ('+region+')'+X);
  try {
    const { execSync } = await import('child_process');
    const raw = execSync(`aws secretsmanager get-secret-value --secret-id "${arn}" --region ${region} --query SecretString --output text`,{encoding:'utf8',timeout:10000,stdio:['pipe','pipe','pipe']});
    let secrets; try { secrets=JSON.parse(raw.trim()); } catch { secrets={SECRET_VALUE:raw.trim()}; }
    console.log(G+'  ✓ AWS SM: '+Object.keys(secrets).length+' key(s)'+X);
    return secrets;
  } catch(cliErr) {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      const client = new SecretsManagerClient({region});
      const res = await client.send(new GetSecretValueCommand({SecretId:arn}));
      const secrets = JSON.parse(res.SecretString);
      console.log(G+'  ✓ AWS SM (SDK): '+Object.keys(secrets).length+' key(s)'+X);
      return secrets;
    } catch(sdkErr) {
      if (sdkErr.code!=='MODULE_NOT_FOUND') { console.error(R+'  ✗ AWS SM auth error: '+sdkErr.message+X); process.exit(1); }
      console.error(R+'  ✗ AWS CLI and SDK not available\n  Install AWS CLI or: npm install @aws-sdk/client-secrets-manager'+X);
      process.exit(2);
    }
  }
}

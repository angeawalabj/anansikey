/**
 * Node-only cloud providers. Both do real synchronous cryptographic
 * signing via node:crypto (SigV4 for AWS, HMAC-SHA256 for Pusher) — see
 * Phase 1 for the verification work behind each. Deliberately excluded
 * from the browser bundle (packages/web): WebCrypto's crypto.subtle is
 * Promise-based, and the format()/request() contract in core/index.js
 * calls both synchronously, so there is no drop-in browser equivalent
 * without a larger async-pipeline refactor. Available in CLI, GitHub
 * Action, and the VS Code extension, which all run in Node.
 */
import crypto from 'node:crypto';
import { ok, fail, warn, malformed, ErrorCode } from '../results/index.js';
import { maskSecret } from '../results/mask.js';

// ── AWS SigV4 helpers ───────────────────────────────────────────
// Pure functions, node:crypto only. Implements the standard AWS
// Signature Version 4 process, documented at:
// https://docs.aws.amazon.com/IAM/latest/UserGuide/create-signed-request.html
//
// Honest limitation: validated structurally and against the officially
// documented algorithm steps (see
// packages/core/providers/__tests__/cloud.sigv4.test.js for why an
// externally-sourced test vector was deliberately NOT trusted here) but
// not round-tripped against a live AWS account — test with a real
// (ideally throwaway/scoped) credential pair before relying on this in CI.

function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg, 'utf8').digest('hex');
}

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest();
}

function hmacHex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

function getSigningKey(secretKey, dateStamp, region, service) {
  const kDate    = hmac('AWS4' + secretKey, dateStamp);
  const kRegion  = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
}

function rfc3986Encode(str) {
  return encodeURIComponent(str)
    .replace(/[!'()*]/g, c => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Build a SigV4-signed request descriptor for STS GetCallerIdentity —
 * the canonical "is this credential valid" read-only check: it requires
 * no IAM permissions beyond a valid signature, so it can't be blocked by
 * a restrictive policy the way most other read endpoints can.
 */
function buildSignedRequest({ accessKeyId, secretAccessKey, region }) {
  const service = 'sts';
  const host    = `sts.${region}.amazonaws.com`;
  const method  = 'GET';
  const canonicalUri = '/';

  const queryParams = { Action: 'GetCallerIdentity', Version: '2011-06-15' };
  const canonicalQuerystring = Object.keys(queryParams).sort()
    .map(k => `${rfc3986Encode(k)}=${rfc3986Encode(queryParams[k])}`)
    .join('&');

  const now = new Date();
  const amzDate   = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const payloadHash      = sha256Hex('');
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders    = 'host;x-amz-date';

  const canonicalRequest = [
    method, canonicalUri, canonicalQuerystring,
    canonicalHeaders, signedHeaders, payloadHash,
  ].join('\n');

  const algorithm      = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    algorithm, amzDate, credentialScope, sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSigningKey(secretAccessKey, dateStamp, region, service);
  const signature  = hmacHex(signingKey, stringToSign);

  const authorizationHeader =
    `${algorithm} Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  return {
    hostname: host,
    path:    `${canonicalUri}?${canonicalQuerystring}`,
    method,
    headers: {
      'X-Amz-Date':    amzDate,
      'Authorization': authorizationHeader,
    },
  };
}

export const aws = {
  id: 'aws', name: 'AWS', icon: '☁', category: 'Cloud',
  docs: 'https://console.aws.amazon.com/iam/home#/security_credentials',
  fields: [
    { name: 'access_key_id',     label: 'Access Key ID',     placeholder: 'AKIAxxx' },
    { name: 'secret_access_key', label: 'Secret Access Key', placeholder: 'xxxxxxx' },
    { name: 'region',            label: 'Region',            placeholder: 'us-east-1' },
  ],
  env_vars: ['AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_REGION', 'AWS_DEFAULT_REGION'],

  format({ access_key_id, secret_access_key, region }) {
    const id  = access_key_id?.trim() ?? '';
    const sec = secret_access_key?.trim() ?? '';
    const reg = region?.trim() ?? '';

    if (!id) return fail(ErrorCode.MISSING_KEY, 'Access Key ID is required',
      'Find it at console.aws.amazon.com/iam → Security credentials');

    const PREFIX = ['AKIA', 'ASIA', 'AROA', 'AIDA', 'ANPA', 'ANVA', 'APKA'];
    if (!PREFIX.some(p => id.startsWith(p)))
      return fail(ErrorCode.FORMAT_ERROR,
        `Access Key ID must start with AKIA, ASIA, or AROA (you have: ${id.slice(0, 4)})`,
        'Find your key at console.aws.amazon.com/iam → Security credentials');

    if (id.length !== 20)
      return fail(ErrorCode.FORMAT_ERROR,
        `Access Key ID must be 20 characters (you have ${id.length})`,
        'Copy the full ID from AWS console');

    if (id.startsWith('ASIA'))
      return warn(ErrorCode.FORMAT_WARNING,
        'This is a temporary STS credential — live testing requires a session token, which Anansikey does not currently collect',
        'Temporary credentials expire after 1-12 hours and need X-Amz-Security-Token to validate live. Use long-term AKIA credentials for a live check, or track this limitation in the roadmap.');

    if (!sec) return fail(ErrorCode.MISSING_KEY, 'Secret Access Key is required',
      'Find it at console.aws.amazon.com/iam → Security credentials');

    if (sec.length !== 40)
      return fail(ErrorCode.FORMAT_ERROR,
        `Secret Access Key must be 40 characters (you have ${sec.length})`,
        'Copy the full key — it is shown only once when created');

    if (!reg) return fail(ErrorCode.MISSING_KEY, 'Region is required',
      'Use a region code like us-east-1, eu-west-1, ap-southeast-1');

    return null;
  },

  request({ access_key_id, secret_access_key, region }) {
    return buildSignedRequest({
      accessKeyId:     access_key_id.trim(),
      secretAccessKey: secret_access_key.trim(),
      region:          region.trim(),
    });
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);

    if (status === 200) {
      const result = body?.GetCallerIdentityResponse?.GetCallerIdentityResult;
      if (!result) return malformed(status, JSON.stringify(body));
      return ok(
        `AWS connected — account ${result.Account ?? 'N/A'}`,
        `ARN: ${result.Arn ?? 'N/A'} · Key: ${maskSecret(creds?.access_key_id)}`
      );
    }

    const errCode = body?.Error?.Code ?? body?.__type;
    const errMsg  = body?.Error?.Message ?? body?.message;

    if (status === 403) {
      if (errCode === 'InvalidClientTokenId')
        return fail(ErrorCode.AUTH_FAILED,
          'Access Key ID does not exist in AWS records',
          'Check the key at console.aws.amazon.com/iam → Users → Security credentials');
      if (errCode === 'SignatureDoesNotMatch')
        return fail(ErrorCode.AUTH_FAILED,
          'Secret Access Key is incorrect for this Access Key ID',
          'Regenerate the key pair at console.aws.amazon.com/iam → Security credentials');
      if (errCode === 'AccessDenied')
        return fail(ErrorCode.PERMISSION_DENIED,
          errMsg ?? 'Access denied calling sts:GetCallerIdentity',
          'This should be permission-free for any valid signature — check for an explicit deny in an SCP or permissions boundary');
      return fail(ErrorCode.AUTH_FAILED, errMsg ?? 'Authentication failed',
        'Check your AWS credentials at console.aws.amazon.com/iam');
    }

    if (status === 400) return fail(ErrorCode.FORMAT_ERROR,
      errMsg ?? 'Malformed signed request',
      'This indicates a bug in Anansikey\'s SigV4 implementation — please open an issue');

    if (status === 429) return fail(ErrorCode.RATE_LIMITED,
      'AWS STS rate limit reached', 'Wait and retry');

    if (status >= 500) return fail(ErrorCode.API_ERROR,
      `AWS STS unavailable (HTTP ${status})`, 'status.aws.amazon.com');

    return fail(ErrorCode.API_ERROR, errMsg ?? `Unexpected response: HTTP ${status}`);
  },
};

// ── Pusher ─────────────────────────────────────────────────────
// Live-validated via the REST API query-string authentication scheme,
// verified computationally against the official worked example (see
// packages/core/providers/__tests__/pusher.auth.test.js).
// Targets GET /apps/{id}/channels (read-only, [P2]-compliant) rather
// than POST /apps/{id}/events (write, would actually publish).
function signPusherRequest({ appId, key, secret, cluster }) {
  const path = `/apps/${appId}/channels`;
  const authTimestamp = Math.floor(Date.now() / 1000).toString();

  const params = {
    auth_key: key,
    auth_timestamp: authTimestamp,
    auth_version: '1.0',
  };

  const queryString = Object.keys(params).sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');

  const stringToSign = ['GET', path, queryString].join('\n');
  const signature = crypto.createHmac('sha256', secret).update(stringToSign, 'utf8').digest('hex');

  return {
    hostname: `api-${cluster}.pusher.com`,
    path:     `${path}?${queryString}&auth_signature=${signature}`,
    method:   'GET',
  };
}

export const pusher = {
  id: 'pusher', name: 'Pusher', icon: '📡', category: 'Realtime',
  docs: 'https://dashboard.pusher.com',
  fields: [
    { name: 'app_id',     label: 'App ID',     placeholder: '123456' },
    { name: 'app_key',    label: 'App Key',    placeholder: 'xxxxxxxxxx' },
    { name: 'app_secret', label: 'App Secret', placeholder: 'xxxxxxxxxx' },
    { name: 'cluster',    label: 'Cluster',    placeholder: 'eu' },
  ],
  env_vars: ['PUSHER_APP_ID', 'PUSHER_APP_KEY', 'PUSHER_APP_SECRET', 'PUSHER_CLUSTER'],

  format({ app_id, app_key, app_secret, cluster }) {
    if (!app_id?.trim())     return fail(ErrorCode.MISSING_KEY, 'App ID is required', 'Find at dashboard.pusher.com');
    if (!app_key?.trim())    return fail(ErrorCode.MISSING_KEY, 'App Key is required', 'Find at dashboard.pusher.com');
    if (!app_secret?.trim()) return fail(ErrorCode.MISSING_KEY, 'App Secret is required', 'Find at dashboard.pusher.com');
    if (!cluster?.trim())    return fail(ErrorCode.MISSING_KEY, 'Cluster is required',
      'Valid clusters: mt1 (US East), us2 (US West), eu, ap1, ap2, ap3, ap4, sa1');
    const CLUSTERS = ['mt1', 'us2', 'us3', 'eu', 'ap1', 'ap2', 'ap3', 'ap4', 'sa1'];
    if (!CLUSTERS.includes(cluster.trim().toLowerCase()))
      return fail(ErrorCode.FORMAT_ERROR,
        `Unknown cluster "${cluster}" — valid: ${CLUSTERS.join(', ')}`,
        'Find your cluster at dashboard.pusher.com → App → Keys');
    return null;
  },

  request({ app_id, app_key, app_secret, cluster }) {
    return signPusherRequest({
      appId:  app_id.trim(),
      key:    app_key.trim(),
      secret: app_secret.trim(),
      cluster: cluster.trim().toLowerCase(),
    });
  },

  parse(status, body, creds) {
    if (body?._malformed) return malformed(status, body._raw);

    if (status === 200) {
      const count = Array.isArray(body?.channels) ? Object.keys(body.channels).length
        : (body?.channels ? Object.keys(body.channels).length : 0);
      return ok(
        `Pusher connected — ${count} active channel(s)`,
        `App: ${creds?.app_id} · Cluster: ${creds?.cluster} · Key: ${maskSecret(creds?.app_secret)}`
      );
    }

    if (status === 401) {
      const errMsg = typeof body === 'string' ? body : (body?.error ?? '');
      if (/signature/i.test(errMsg))
        return fail(ErrorCode.AUTH_FAILED,
          'App Secret does not match this App Key/App ID',
          'Check all three values together at dashboard.pusher.com → App → Keys — they must belong to the same app');
      if (/timestamp/i.test(errMsg))
        return fail(ErrorCode.AUTH_FAILED,
          'Request timestamp rejected — check your system clock',
          'Pusher rejects requests with a clock skew of more than ~10 minutes');
      return fail(ErrorCode.AUTH_FAILED, errMsg || 'Authentication failed',
        'Check App ID, App Key, App Secret at dashboard.pusher.com → App → Keys');
    }

    if (status === 404) return fail(ErrorCode.NOT_FOUND,
      `App ID "${creds?.app_id}" not found in cluster "${creds?.cluster}"`,
      'Check the App ID and cluster match at dashboard.pusher.com → App → Keys');
    if (status === 429) return fail(ErrorCode.RATE_LIMITED, 'Pusher rate limit reached', 'Wait and retry');
    if (status >= 500)  return fail(ErrorCode.API_ERROR, `Pusher unavailable (HTTP ${status})`, 'status.pusher.com');

    return fail(ErrorCode.API_ERROR, `Unexpected response (HTTP ${status})`, 'Try again');
  },
};

export default { aws, pusher };

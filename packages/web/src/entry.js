/**
 * Anansikey web app — real entry point.
 *
 * This imports the actual @anansikey/core registry — the same provider
 * definitions the CLI, GitHub Action, and VS Code extension use. No
 * hand-duplicated provider logic here; that duplication (10 providers
 * reimplemented by hand in the original single-file HTML) was the whole
 * point of this rewrite. See DEPENDENCIES.md and packages/core/index.js
 * for why AWS/Pusher/Apple/VAPID are listed but disabled here — they
 * need node:crypto, which doesn't exist in a browser.
 */
import {
  PROVIDERS, detectServices, runProvider, maskSecret,
} from '@anansikey/core';
import { browserRequest } from '@anansikey/core/adapters/browser.js';

const NODE_ONLY_MESSAGE =
  'This provider needs real cryptographic signing (node:crypto) and only runs in the CLI, GitHub Action, or VS Code extension — not in a browser. ' +
  'Run: npx anansikey check ';

// ── Sidebar ──────────────────────────────────────────────────────────
const sidebar = document.getElementById('sidebar');
const byCategory = {};
for (const p of PROVIDERS) {
  (byCategory[p.category] = byCategory[p.category] ?? []).push(p);
}

let _active = null;

for (const [cat, providers] of Object.entries(byCategory)) {
  const section = document.createElement('div');
  section.className = 'sidebar-section';
  section.innerHTML = `<div class="sidebar-category">${cat}</div>`;

  for (const p of providers) {
    const btn = document.createElement('button');
    btn.className = 'service-btn';
    btn.dataset.id = p.id;

    if (p.runtime === 'node') {
      btn.classList.add('disabled');
      btn.title = NODE_ONLY_MESSAGE + p.id;
      btn.innerHTML = `
        <span class="svc-icon">${p.icon}</span>
        <span class="svc-name">${p.name}</span>
        <span class="svc-badge">CLI only</span>`;
      btn.addEventListener('click', () => showNodeOnlyNotice(p));
    } else {
      btn.innerHTML = `
        <span class="svc-icon">${p.icon}</span>
        <span class="svc-name">${p.name}</span>
        <span class="svc-status" id="dot-${p.id}"></span>`;
      btn.addEventListener('click', () => selectProvider(p));
    }
    section.appendChild(btn);
  }
  // The shell ships a static ".principles" footer inside the sidebar; the
  // generated sections must land above it, not after it.
  const footer = sidebar.querySelector('.principles');
  if (footer) sidebar.insertBefore(section, footer);
  else sidebar.appendChild(section);
}

// ── Single-provider form ──────────────────────────────────────────────
function selectProvider(provider) {
  _active = provider;

  document.querySelectorAll('.service-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.id === provider.id));

  document.getElementById('svc-icon').textContent = provider.icon;
  document.getElementById('svc-name').textContent = provider.name;
  const docsLink = document.getElementById('svc-docs');
  docsLink.href = provider.docs;
  docsLink.textContent = `→ ${new URL(provider.docs).hostname}`;

  const container = document.getElementById('fields-container');
  container.innerHTML = '';
  for (const field of provider.fields) {
    const div = document.createElement('div');
    div.className = 'field';
    div.innerHTML = `
      <label for="field-${field.name}">${field.label}</label>
      <input id="field-${field.name}" type="text" name="${field.name}"
             autocomplete="off" autocorrect="off" spellcheck="false"
             placeholder="${field.placeholder}">`;
    container.appendChild(div);
  }

  document.getElementById('result-panel').className = 'result-panel';
  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('node-only-view').style.display = 'none';
  document.getElementById('service-view').style.display = 'block';
  setTimeout(() => container.querySelector('input')?.focus(), 0);
}

const SIGNING_SCHEME = {
  aws:    'AWS SigV4',
  pusher: 'Pusher HMAC',
  apple:  'Apple ES256 JWT',
  vapid:  'VAPID ECDH',
};

// Renders into its own container rather than overwriting #service-view:
// the form markup (fields-container, result-panel, …) has to survive so
// the user can click back to a browser-capable provider afterwards.
function showNodeOnlyNotice(provider) {
  document.querySelectorAll('.service-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.id === provider.id));
  _active = null;

  document.getElementById('welcome-state').style.display = 'none';
  document.getElementById('service-view').style.display = 'none';

  const view = document.getElementById('node-only-view');
  view.style.display = 'block';
  view.innerHTML = `
    <div class="node-only-notice">
      <div class="service-icon-lg">${provider.icon}</div>
      <h2>${provider.name} — CLI / Action / VS Code only</h2>
      <p>${NODE_ONLY_MESSAGE}${provider.id} <code>--field=value</code></p>
      <p class="dim">This is a structural limit, not a missing feature: real signing
      (${SIGNING_SCHEME[provider.id] ?? 'cryptographic signing'})
      requires node:crypto, which browsers don't expose.</p>
    </div>`;
}

document.getElementById('btn-validate').addEventListener('click', async () => {
  if (!_active) return;
  const btn = document.getElementById('btn-validate');
  const creds = {};
  for (const field of _active.fields) {
    creds[field.name] = document.getElementById(`field-${field.name}`)?.value ?? '';
  }

  btn.classList.add('loading');
  btn.disabled = true;
  const result = await runProvider(_active, creds, browserRequest);
  btn.classList.remove('loading');
  btn.disabled = false;

  showResult(result);
  const dot = document.getElementById(`dot-${_active.id}`);
  if (dot) dot.className = `svc-status ${result.type === 'success' ? 'ok' : result.type === 'warn' ? 'warn' : 'fail'}`;
});

function showResult(result) {
  const panel = document.getElementById('result-panel');
  const cls = result.type === 'success' ? 'ok' : result.type === 'warn' ? 'warn' : 'fail';

  document.getElementById('result-bar').className = `result-bar ${cls}`;
  document.getElementById('result-icon').className = `result-icon ${cls}`;
  document.getElementById('result-icon').textContent = result.type === 'success' ? '✓' : result.type === 'warn' ? '⚠' : '✗';
  document.getElementById('result-msg').textContent = result.msg;
  document.getElementById('result-code').textContent = result.code ?? '';

  const body = document.getElementById('result-body');
  body.innerHTML = '';
  if (result.detail) {
    for (const line of result.detail.split('\n')) {
      const [k, ...rest] = line.split(':');
      if (rest.length) {
        body.insertAdjacentHTML('beforeend',
          `<div class="result-row"><span class="rk">${k.trim()}</span><span class="rv">${rest.join(':').trim()}</span></div>`);
      }
    }
  }
  if (result.fix) {
    body.insertAdjacentHTML('beforeend',
      `<div class="result-row"><span class="rk">fix</span><span class="rv fix">${result.fix.split('\n')[0]}</span></div>`);
  }

  if (_active) {
    for (const field of _active.fields) {
      const input = document.getElementById(`field-${field.name}`);
      if (input) input.className = cls;
    }
  }
  panel.className = 'result-panel visible';
}

// ── Scan .env tab ──────────────────────────────────────────────────────
function parseEnv(text) {
  const vars = {};
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key) vars[key] = val;
  }
  return vars;
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    document.getElementById('tab-single').style.display = tab === 'single' ? 'block' : 'none';
    document.getElementById('tab-scan').classList.toggle('active', tab === 'scan');
  });
});

document.getElementById('btn-scan').addEventListener('click', async () => {
  const text = document.getElementById('scan-input').value.trim();
  if (!text) return;

  const vars = parseEnv(text);
  // Browser scan only ever matches runtime:'any' providers, since
  // PROVIDERS here already excludes node-only ones by construction
  // (this file imports the browser-safe index.js).
  const detected = detectServices(vars);
  const hint = document.getElementById('scan-hint');
  const results = document.getElementById('scan-results');
  const btn = document.getElementById('btn-scan');

  if (!detected.length) {
    hint.textContent = 'no recognized credential keys found (or they need CLI-only providers — see sidebar)';
    results.innerHTML = '';
    return;
  }

  hint.textContent = `${detected.length} service(s) detected`;
  results.innerHTML = '';
  btn.classList.add('loading');
  btn.disabled = true;

  for (let i = 0; i < detected.length; i++) {
    const { provider, creds } = detected[i];
    const row = document.createElement('div');
    row.className = 'scan-row';
    row.innerHTML = `
      <span class="sr-icon">${provider.icon}</span>
      <span class="sr-name">${provider.name}</span>
      <span class="sr-msg" style="color:var(--text-dim)">testing...</span>
      <span class="sr-key">${maskSecret(Object.values(creds)[0] ?? '')}</span>`;
    results.appendChild(row);

    const result = await runProvider(provider, creds, browserRequest);
    const cls = result.type === 'success' ? 'ok' : result.type === 'warn' ? 'warn' : 'fail';
    row.className = `scan-row ${cls}`;
    row.querySelector('.sr-icon').textContent = result.type === 'success' ? '✓' : result.type === 'warn' ? '⚠' : '✗';
    row.querySelector('.sr-msg').textContent = result.msg;
    row.querySelector('.sr-msg').style.color = '';

    const dot = document.getElementById(`dot-${provider.id}`);
    if (dot) dot.className = `svc-status ${cls}`;

    if (i < detected.length - 1) await new Promise(r => setTimeout(r, 500)); // [P7]
  }

  btn.classList.remove('loading');
  btn.disabled = false;
  hint.textContent = `${detected.length} service(s) validated`;
});

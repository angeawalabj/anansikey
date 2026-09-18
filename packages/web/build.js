#!/usr/bin/env node
import esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const watch = process.argv.includes('--watch');

mkdirSync(path.join(__dir, 'dist'), { recursive: true });

async function build() {
  // platform: 'browser' is the critical line — it makes esbuild resolve
  // '@anansikey/core' via package.json's "default" export condition
  // (index.js, browser-safe, 21 providers) rather than the "node"
  // condition (index.node.js, which pulls in node:crypto and would fail
  // to bundle for a browser target).
  const result = await esbuild.build({
    entryPoints: [path.join(__dir, 'src/entry.js')],
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: ['es2022'],
    minify: !watch,
    write: false,
    logLevel: 'info',
  });

  const bundleCode = result.outputFiles[0].text;

  // Pattern-based, not substring-based: a UI string explaining *why* a
  // provider needs node:crypto (as entry.js's NODE_ONLY_MESSAGE does) is
  // legitimate and must not trip this check — only an actual import or
  // require of a Node built-in should.
  const FORBIDDEN_PATTERNS = [
    /\bfrom\s*["']node:(crypto|https?|fs|child_process)["']/,
    /\brequire\(\s*["']node:(crypto|https?|fs|child_process)["']\s*\)/,
    /\brequire\(\s*["'](crypto|https?|child_process)["']\s*\)/,
  ];
  const found = FORBIDDEN_PATTERNS.filter(re => re.test(bundleCode)).map(re => re.source);
  if (found.length > 0) {
    console.error('\x1b[31m✗ Bundle purity check failed — matched:', found.join(' | '), '\x1b[0m');
    console.error('  This means a node-only provider leaked into the browser bundle.');
    process.exit(1);
  }

  const htmlTemplate = readFileSync(path.join(__dir, 'src/index.html'), 'utf8');

  // Matched on the marker name rather than the full comment text, and
  // asserted rather than assumed: String.replace() with a string that
  // isn't found returns the input unchanged, so an edit to the comment's
  // wording would otherwise ship a dist/index.html containing no
  // JavaScript at all — and the purity check would happily pass on it.
  const PLACEHOLDER = /<!--\s*ANANSIKEY_BUNDLE_PLACEHOLDER\b[^>]*-->/;
  if (!PLACEHOLDER.test(htmlTemplate)) {
    console.error('\x1b[31m✗ src/index.html has no ANANSIKEY_BUNDLE_PLACEHOLDER comment — nowhere to inline the bundle\x1b[0m');
    process.exit(1);
  }

  const finalHtml = htmlTemplate.replace(
    PLACEHOLDER,
    () => `<script>\n${bundleCode}\n</script>`
  );

  writeFileSync(path.join(__dir, 'dist/index.html'), finalHtml);
  console.log('\x1b[32m✓ dist/index.html built —', (finalHtml.length / 1024).toFixed(1), 'KB, single file, no external requests to load the app itself\x1b[0m');
}

build().catch(e => {
  console.error('\x1b[31mBuild failed:', e.message, '\x1b[0m');
  process.exit(1);
});

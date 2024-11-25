'use strict';
/**
 * Anansikey VS Code Extension v2
 *
 * Imports @anansikey/core directly — zero provider duplication.
 * Injects the Node.js HTTP adapter (VS Code runs Node.js).
 *
 * Security principles enforced:
 *   [P1] Zero-Knowledge: requests go directly to provider APIs
 *   [P3] Verbose: full error messages with fix text shown in output
 *   [P6] Key masking: maskSecret() applied before all output
 *   [P7] Rate respect: SCAN_DELAY_MS between tests
 *   [P8] Honest identity: User-Agent set in node adapter
 */

const vscode = require('vscode');
const path   = require('path');
const fs     = require('fs');

// ── Import @anansikey/core via relative path ──────────────────
// In production build, these are bundled by esbuild.
// In dev, they resolve relative to the monorepo root.
const CORE_PATH = path.resolve(__dirname, '../../core');

let PROVIDERS, PROVIDERS_BY_ID, detectServices, runProvider,
    ResultType, ErrorCode, exitCodeFor, maskSecret, nodeRequest;

async function loadCore() {
  // Dynamic import because core is ESM
  const core    = await import(path.join(CORE_PATH, 'index.js'));
  const adapter = await import(path.join(CORE_PATH, 'adapters/node.js'));
  const mask    = await import(path.join(CORE_PATH, 'results/mask.js'));

  PROVIDERS        = core.PROVIDERS;
  PROVIDERS_BY_ID  = core.PROVIDERS_BY_ID;
  detectServices   = core.detectServices;
  runProvider      = core.runProvider;
  ResultType       = core.ResultType;
  ErrorCode        = core.ErrorCode;
  exitCodeFor      = core.exitCodeFor;
  maskSecret       = mask.maskSecret;
  nodeRequest      = adapter.request;
}

// ── Constants ─────────────────────────────────────────────────
const SCAN_DELAY_MS  = 500;   // [P7]
const OUTPUT_CHANNEL = 'Anansikey';
const EXTENSION_ID   = 'anansikey.anansikey';

// ── State ─────────────────────────────────────────────────────
let outputChannel;
let statusBarItem;
let resultsProvider;
let decorationTypes = {};

// Decoration types — defined once, reused
const DECO_SUCCESS = vscode.window.createTextEditorDecorationType({
  after: {
    contentText:     ' ✓',
    color:           '#00e87a',
    fontWeight:      'bold',
    margin:          '0 0 0 8px',
  },
});

const DECO_ERROR = vscode.window.createTextEditorDecorationType({
  after: {
    contentText:     ' ✗',
    color:           '#ff4757',
    fontWeight:      'bold',
    margin:          '0 0 0 8px',
  },
});

const DECO_WARN = vscode.window.createTextEditorDecorationType({
  after: {
    contentText:     ' ⚠',
    color:           '#ffd32a',
    fontWeight:      'bold',
    margin:          '0 0 0 8px',
  },
});

// ── Activation ────────────────────────────────────────────────
async function activate(context) {
  await loadCore();

  // Output channel
  outputChannel = vscode.window.createOutputChannel(OUTPUT_CHANNEL);
  context.subscriptions.push(outputChannel);

  // Status bar
  statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'anansikey.validateFile';
  statusBarItem.text    = '🕷 Anansikey';
  statusBarItem.tooltip = 'Click to validate .env credentials';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Tree view
  resultsProvider = new ResultsTreeProvider();
  vscode.window.createTreeView('anansikey.results', {
    treeDataProvider: resultsProvider,
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('anansikey.validateFile',
      () => validateActiveFile()),
    vscode.commands.registerCommand('anansikey.validateAll',
      () => validateAllWorkspace()),
    vscode.commands.registerCommand('anansikey.validateSelection',
      () => validateSelection()),
    vscode.commands.registerCommand('anansikey.clearDecorations',
      () => clearAllDecorations()),
  );

  // Auto-validate on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      const cfg = vscode.workspace.getConfiguration('anansikey');
      if (cfg.get('autoValidateOnSave') && isEnvFile(doc.fileName)) {
        validateFile(doc.fileName);
      }
    })
  );

  // Show in status bar when .env file is open
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(editor => {
      if (editor && isEnvFile(editor.document.fileName)) {
        statusBarItem.text    = '🕷 Anansikey — click to validate';
        statusBarItem.command = 'anansikey.validateFile';
      } else {
        statusBarItem.text    = '🕷 Anansikey';
      }
    })
  );
}

function deactivate() {
  clearAllDecorations();
}

// ── Core: validate a .env file ────────────────────────────────
async function validateFile(filePath) {
  if (!filePath) return;

  const cfg     = vscode.workspace.getConfiguration('anansikey');
  const doMask  = cfg.get('maskSecretsInOutput') !== false; // default true [P6]
  const doInline = cfg.get('showInlineDecorations') !== false;

  outputChannel.clear();
  outputChannel.show(true);

  const ts = new Date().toLocaleTimeString();
  outputChannel.appendLine('─'.repeat(60));
  outputChannel.appendLine(`🕷 Anansikey — ${path.basename(filePath)}`);
  outputChannel.appendLine(`   ${ts}`);
  outputChannel.appendLine(`   [P1] Requests go directly to providers — not to Anansikey`);
  if (doMask) outputChannel.appendLine(`   [P6] Secret values are masked in this output`);
  outputChannel.appendLine('─'.repeat(60));
  outputChannel.appendLine('');

  // Parse the .env file
  let vars;
  try {
    vars = parseEnvFile(filePath);
  } catch (e) {
    vscode.window.showErrorMessage(`Anansikey: Cannot read file — ${e.message}`);
    return;
  }

  const detected = detectServices(vars);

  if (detected.length === 0) {
    outputChannel.appendLine('⚠  No recognized credential keys found.');
    outputChannel.appendLine('   Ensure keys use standard names:');
    outputChannel.appendLine('   STRIPE_SECRET_KEY, OPENAI_API_KEY, GITHUB_TOKEN, etc.');
    statusBarItem.text    = '🕷 ⚠ No credentials detected';
    statusBarItem.color   = '#ffd32a';
    return;
  }

  outputChannel.appendLine(`Found ${detected.length} service(s) to validate\n`);

  // Update status bar: running
  statusBarItem.text  = '🕷 Anansikey — validating...';
  statusBarItem.color = undefined;

  const results = [];
  const sleep   = ms => new Promise(r => setTimeout(r, ms));

  for (let i = 0; i < detected.length; i++) {
    const { provider, creds } = detected[i];
    const maskedCreds = doMask ? maskAllCreds(creds) : creds;

    outputChannel.appendLine(`Testing ${provider.icon} ${provider.name}...`);

    const result = await runProvider(provider, creds, nodeRequest);
    results.push({ provider, creds, result });

    // Format output
    const icon   = result.type === ResultType.SUCCESS ? '✓'
                 : result.type === ResultType.WARN    ? '⚠' : '✗';
    const prefix = result.type === ResultType.SUCCESS ? '✓'
                 : result.type === ResultType.WARN    ? '⚠' : '✗';

    outputChannel.appendLine(`${prefix} ${provider.name}`);
    outputChannel.appendLine(`  → ${result.msg}`);

    if (result.type !== ResultType.SUCCESS && result.fix) {
      outputChannel.appendLine(`  💡 Fix: ${result.fix.split('\n')[0]}`);
    }
    if (result.detail) {
      // Mask secret values in detail output [P6]
      const detail = doMask ? maskDetailOutput(result.detail) : result.detail;
      outputChannel.appendLine(`  ${detail.replace(/\n/g, '\n  ')}`);
    }
    outputChannel.appendLine('');

    if (i < detected.length - 1) await sleep(SCAN_DELAY_MS); // [P7]
  }

  // Summary
  const passed = results.filter(r => r.result.type === ResultType.SUCCESS).length;
  const failed = results.filter(r => r.result.type === ResultType.ERROR).length;
  const warned = results.filter(r => r.result.type === ResultType.WARN).length;

  outputChannel.appendLine('─'.repeat(60));
  outputChannel.appendLine(`✓ ${passed} passed  ✗ ${failed} failed  ⚠ ${warned} warned`);
  outputChannel.appendLine('');
  outputChannel.appendLine('[P1] No credentials were transmitted to Anansikey servers.');
  outputChannel.appendLine('─'.repeat(60));

  // Status bar summary
  if (failed > 0) {
    statusBarItem.text  = `🕷 ✗ ${failed} failed`;
    statusBarItem.color = '#ff4757';
    statusBarItem.tooltip = `Anansikey: ${failed} credential(s) invalid — click to see details`;
  } else if (warned > 0) {
    statusBarItem.text  = `🕷 ⚠ ${warned} warning(s)`;
    statusBarItem.color = '#ffd32a';
    statusBarItem.tooltip = `Anansikey: ${warned} warning(s) — click to see details`;
  } else {
    statusBarItem.text  = `🕷 ✓ ${passed} valid`;
    statusBarItem.color = '#00e87a';
    statusBarItem.tooltip = `Anansikey: All ${passed} credential(s) valid`;
  }

  // Tree view
  resultsProvider.update(results);

  // Inline decorations
  if (doInline) {
    applyDecorations(filePath, results, vars);
  }
}

// ── Inline decorations ────────────────────────────────────────
function applyDecorations(filePath, results, vars) {
  const editor = vscode.window.visibleTextEditors
    .find(e => e.document.fileName === filePath);
  if (!editor) return;

  const successRanges = [];
  const errorRanges   = [];
  const warnRanges    = [];

  const lines = editor.document.getText().split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('#')) continue;

    const eq = line.indexOf('=');
    if (eq < 1) continue;

    const key = line.slice(0, eq).trim();
    if (!key) continue;

    // Find which provider result this key belongs to
    const matchedResult = results.find(({ provider }) =>
      provider.env_vars.includes(key));

    if (!matchedResult) continue;

    const range = new vscode.Range(
      new vscode.Position(i, line.length),
      new vscode.Position(i, line.length),
    );

    if (matchedResult.result.type === ResultType.SUCCESS) successRanges.push(range);
    else if (matchedResult.result.type === ResultType.WARN) warnRanges.push(range);
    else errorRanges.push(range);
  }

  editor.setDecorations(DECO_SUCCESS, successRanges);
  editor.setDecorations(DECO_ERROR,   errorRanges);
  editor.setDecorations(DECO_WARN,    warnRanges);
}

function clearAllDecorations() {
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(DECO_SUCCESS, []);
    editor.setDecorations(DECO_ERROR,   []);
    editor.setDecorations(DECO_WARN,    []);
  }
}

// ── Commands ──────────────────────────────────────────────────
async function validateActiveFile() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showInformationMessage('Anansikey: Open a .env file to validate.');
    return;
  }
  if (!isEnvFile(editor.document.fileName)) {
    // Ask user to pick a .env file from workspace
    const files = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**');
    if (!files.length) {
      vscode.window.showWarningMessage('Anansikey: No .env files found in workspace.');
      return;
    }
    const picked = await vscode.window.showQuickPick(
      files.map(f => ({ label: vscode.workspace.asRelativePath(f), uri: f })),
      { placeHolder: 'Select a .env file to validate' }
    );
    if (picked) await validateFile(picked.uri.fsPath);
    return;
  }
  await validateFile(editor.document.fileName);
}

async function validateAllWorkspace() {
  const files = await vscode.workspace.findFiles('**/.env*', '**/node_modules/**');
  if (!files.length) {
    vscode.window.showWarningMessage('Anansikey: No .env files found in workspace.');
    return;
  }
  outputChannel.appendLine(`\n🕷 Validating ${files.length} .env file(s) in workspace...\n`);
  for (const file of files) {
    await validateFile(file.fsPath);
  }
}

async function validateSelection() {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !editor.selection || editor.selection.isEmpty) {
    vscode.window.showInformationMessage('Anansikey: Select a key value to validate.');
    return;
  }
  const selectedText = editor.document.getText(editor.selection).trim();
  if (!selectedText) return;

  // Try to auto-detect which provider this value belongs to
  // by matching the line's key name
  const line     = editor.document.lineAt(editor.selection.start.line).text;
  const eq       = line.indexOf('=');
  const envKey   = eq > 0 ? line.slice(0, eq).trim() : '';

  outputChannel.clear();
  outputChannel.show(true);
  outputChannel.appendLine(`🕷 Validating selected value for: ${envKey || 'unknown key'}`);
  outputChannel.appendLine(`   Value: ${maskSecret(selectedText)}\n`);

  // Find matching provider from the env key name
  const vars     = envKey ? { [envKey]: selectedText } : {};
  const detected = Object.keys(vars).length ? detectServices(vars) : [];

  if (!detected.length) {
    // Fallback: try all single-field providers as format check
    outputChannel.appendLine('⚠  Could not auto-detect provider from key name.');
    outputChannel.appendLine('   Rename your env var to a standard name:');
    outputChannel.appendLine('   STRIPE_SECRET_KEY, OPENAI_API_KEY, GITHUB_TOKEN...');
    return;
  }

  const { provider, creds } = detected[0];
  outputChannel.appendLine(`Detected provider: ${provider.icon} ${provider.name}\n`);

  const result = await runProvider(provider, creds, nodeRequest);

  const icon = result.type === ResultType.SUCCESS ? '✓'
             : result.type === ResultType.WARN    ? '⚠' : '✗';
  outputChannel.appendLine(`${icon} ${provider.name}: ${result.msg}`);
  if (result.fix) outputChannel.appendLine(`  💡 ${result.fix.split('\n')[0]}`);
}

// ── Tree view data provider ───────────────────────────────────
class ResultsTreeProvider {
  constructor() {
    this._onDidChangeTreeData = new vscode.EventEmitter();
    this.onDidChangeTreeData  = this._onDidChangeTreeData.event;
    this._results = [];
  }

  update(results) {
    this._results = results;
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element) { return element; }

  getChildren(element) {
    if (element) return [];

    return this._results.map(({ provider, result }) => {
      const icon  = result.type === ResultType.SUCCESS ? '✓'
                  : result.type === ResultType.WARN    ? '⚠' : '✗';
      const item  = new vscode.TreeItem(
        `${provider.icon} ${provider.name}`,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = `${icon} ${result.msg.slice(0, 50)}`;
      item.tooltip     = result.fix
        ? `${result.msg}\n\n💡 ${result.fix}` : result.msg;
      item.iconPath    = result.type === ResultType.SUCCESS
        ? new vscode.ThemeIcon('check', new vscode.ThemeColor('testing.iconPassed'))
        : result.type === ResultType.WARN
        ? new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconQueued'))
        : new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
      return item;
    });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function isEnvFile(filePath) {
  const name = path.basename(filePath);
  return name === '.env' || name.startsWith('.env.') ||
    name.endsWith('.env') || /\.env\.\w+$/.test(name);
}

function parseEnvFile(filePath) {
  const vars  = {};
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let   val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (key) vars[key] = val;
  }
  return vars;
}

function maskAllCreds(creds) {
  const masked = {};
  for (const [k, v] of Object.entries(creds))
    masked[k] = maskSecret(v);
  return masked;
}

function maskDetailOutput(detail) {
  // Replace anything that looks like a secret value with masked version
  // (long alphanumeric strings)
  return detail.replace(/[A-Za-z0-9_\-]{20,}/g, s => maskSecret(s));
}

module.exports = { activate, deactivate };
